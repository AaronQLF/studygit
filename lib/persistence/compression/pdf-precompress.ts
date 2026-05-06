// PDF-aware lossless pre-compression. Sits *before* the chunker so the bytes
// that flow through FastCDC + zstd are already as small as we can make them
// without touching content.
//
// Why this layer exists: PDFs are already compressed internally
// (FlateDecode/JPEG/JBIG2 streams), so a generic outer codec like zstd has
// almost no entropy to remove. The wins come from PDF-aware structural
// re-emission. We ship two strategies:
//
//   pdflib (default): pdf-lib re-saves the PDF with object streams + xref
//     streams. Pure JS, no native deps, fast, no cold-start cost. Best on
//     unoptimized exports (5–30% gain), near-zero on already-optimized PDFs.
//
//   mupdf (opt-in via PDF_PRECOMPRESS=mupdf): the official MuPDF WASM build
//     re-emits the PDF with deduplicated objects, recompressed streams (incl.
//     fonts/images, lossless flate), and `compress-effort=100`. Substantially
//     bigger wins (typically 10–40% on already-optimized PDFs too) at the
//     cost of a ~10 MB WASM module load and a slower upload path. Loaded
//     lazily via dynamic import so the default path pays nothing.
//
// We "compress" by re-saving and "decompress" by serving the bytes back —
// the optimized PDF is a fully valid PDF, so `streamFileBytes` reconstructs
// exactly what we stored. There's no separate decompress step on read; the
// chunk store already round-trips bytes faithfully.
//
// Determinism note: both strategies are configured to NOT regenerate
// document IDs / metadata timestamps on save, so two users uploading the
// same source PDF produce byte-identical re-saves and continue to share
// chunks at the content-addressable layer.

import { PDFDocument } from "pdf-lib";

export type PrecompressInfo = {
  /** Which optimizer was applied. */
  alg: "pdflib-objstreams" | "mupdf-recompress";
  /** Pre-precompress (as-uploaded) byte length. */
  inSize: number;
  /** Post-precompress byte length actually handed to the chunker. */
  outSize: number;
};

export type PrecompressResult = {
  buffer: Buffer;
  applied: PrecompressInfo | null;
  /** Set when we tried but skipped (encrypted, parse error, no win, ...). */
  skipReason?: string;
};

type Strategy = "off" | "pdflib" | "mupdf";

// Hard ceiling above which we don't even attempt to load the PDF. Both
// optimizers parse the entire object graph into memory, which gets hungry
// past a few hundred MB. The chunk pipeline still handles huge files; they
// just bypass this optimizer.
const DEFAULT_MAX_INPUT_BYTES = 256 * 1024 * 1024; // 256 MiB

function readMaxInputBytes(): number {
  const raw = process.env.PDF_PRECOMPRESS_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_INPUT_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(
      `Invalid PDF_PRECOMPRESS_MAX_BYTES=${raw}; expected a positive integer (bytes).`
    );
  }
  return n;
}

function readStrategy(): Strategy {
  const raw = (process.env.PDF_PRECOMPRESS ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false" || raw === "no") {
    return "off";
  }
  if (raw === "mupdf") return "mupdf";
  // Empty / "on" / "pdflib" / anything else falls back to the safe default.
  return "pdflib";
}

function looksLikePdf(buffer: Buffer, mime: string): boolean {
  if (mime && mime.toLowerCase().startsWith("application/pdf")) return true;
  // Fallback: detect by magic bytes. Some clients send octet-stream.
  return (
    buffer.length >= 5 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d // -
  );
}

async function tryPdfLibReSave(buffer: Buffer): Promise<Buffer | null> {
  try {
    const doc = await PDFDocument.load(buffer, {
      // Keep ModDate / CreationDate untouched so identical inputs produce
      // identical outputs across users — required for chunk-level dedup.
      updateMetadata: false,
      // Encrypted PDFs would otherwise throw; we choose to bail (the bytes
      // are typically already opaque/compressed anyway).
      ignoreEncryption: false,
      // Be lenient with malformed objects: a parse miss should fall through
      // to the original bytes, never crash the upload.
      throwOnInvalidObject: false,
    });
    const out = await doc.save({
      useObjectStreams: true,
      // Re-rendering form field appearances can subtly change visual output;
      // we explicitly preserve whatever the source had.
      updateFieldAppearances: false,
    });
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  } catch {
    return null;
  }
}

// Mupdf is ESM-only and pulls a 9.5 MB WASM module. We load it lazily and
// cache the resolved namespace so a long-lived server only pays the cold
// import once, while the default `pdflib` path never pays it at all.
type MupdfNamespace = typeof import("mupdf");
let cachedMupdf: Promise<MupdfNamespace> | null = null;

function loadMupdf(): Promise<MupdfNamespace> {
  if (!cachedMupdf) {
    cachedMupdf = import("mupdf");
  }
  return cachedMupdf;
}

// Comma-separated PDF write options string for mupdf's `saveToBuffer`. Each
// flag is documented at https://mupdf.readthedocs.io/en/latest/reference/common/pdf-write-options.html
//
//   garbage=deduplicate    drop unreachable objects + remove byte-identical duplicates
//   objstms=yes            pack objects into compressed object streams + xref streams
//   compress=yes           re-flate every stream (lossless)
//   compress-fonts=yes     also re-flate embedded font programs
//   compress-images=yes    also re-flate image streams (lossless; doesn't re-encode JPEGs)
//   compress-effort=100    spend max CPU per stream — we only do this once per PDF,
//                          so trading wall-clock for ratio is the right call
//   regenerate-id=no       keep the PDF /ID array stable so two users uploading the
//                          same source PDF produce byte-identical mupdf output —
//                          required for cross-user chunk dedup to keep working.
const MUPDF_OPTIONS =
  "garbage=deduplicate,objstms=yes,compress=yes," +
  "compress-fonts=yes,compress-images=yes," +
  "compress-effort=100,regenerate-id=no";

async function tryMupdfRecompress(buffer: Buffer): Promise<Buffer | null> {
  let mupdf: MupdfNamespace;
  try {
    mupdf = await loadMupdf();
  } catch {
    return null;
  }

  let doc: import("mupdf").Document | null = null;
  let outBuf: import("mupdf").Buffer | null = null;
  try {
    doc = mupdf.Document.openDocument(buffer, "application/pdf");
    if (!(doc instanceof mupdf.PDFDocument)) {
      return null;
    }
    // Encrypted/locked PDFs: bail. mupdf can sometimes save these with
    // structural transforms that change /Encrypt entries; safer to skip.
    if (typeof doc.needsPassword === "function" && doc.needsPassword()) {
      return null;
    }
    outBuf = doc.saveToBuffer(MUPDF_OPTIONS);
    // `asUint8Array()` returns a *view* into the WASM heap. We must copy
    // out before the heap potentially grows (which detaches the underlying
    // ArrayBuffer) or before the mupdf Buffer is destroyed in `finally`.
    // `Buffer.from(typedArray)` allocates a fresh Node-owned backing store
    // and copies — exactly what we want.
    const view = outBuf.asUint8Array();
    return Buffer.from(view);
  } catch {
    return null;
  } finally {
    // mupdf Userdata objects own native memory inside the WASM heap.
    // Explicitly releasing them is mandatory: the JS-side finalizer is best-
    // effort and not guaranteed to run promptly (or at all) on a long-lived
    // server process. Order doesn't matter here — both are independent.
    try {
      outBuf?.destroy();
    } catch {
      /* ignore */
    }
    try {
      doc?.destroy();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Best-of(original, optimized). Returns the original buffer (with
 * `applied: null`) for non-PDFs, encrypted PDFs, parse errors, or when the
 * re-save isn't actually smaller. Never throws — pre-compression is a
 * best-effort optimization and must not block the upload pipeline.
 */
export async function maybePrecompressPdf(
  buffer: Buffer,
  mime: string
): Promise<PrecompressResult> {
  const strategy = readStrategy();
  if (strategy === "off") {
    return { buffer, applied: null, skipReason: "disabled-by-env" };
  }
  if (!looksLikePdf(buffer, mime)) {
    return { buffer, applied: null, skipReason: "not-pdf" };
  }
  const maxInput = readMaxInputBytes();
  if (buffer.length > maxInput) {
    return { buffer, applied: null, skipReason: "exceeds-max-input" };
  }

  const optimized =
    strategy === "mupdf"
      ? await tryMupdfRecompress(buffer)
      : await tryPdfLibReSave(buffer);

  if (!optimized) {
    return {
      buffer,
      applied: null,
      skipReason: `${strategy}-error-or-unsupported`,
    };
  }

  // Only commit to the re-saved bytes if they're actually smaller. PDFs
  // already produced with object streams + xref streams sometimes come back
  // near-identical or marginally larger; in that case keep the original to
  // avoid spending CPU + cache misses on a non-improvement.
  if (optimized.length >= buffer.length) {
    return {
      buffer,
      applied: null,
      skipReason: `${strategy}-no-size-win`,
    };
  }

  return {
    buffer: optimized,
    applied: {
      alg: strategy === "mupdf" ? "mupdf-recompress" : "pdflib-objstreams",
      inSize: buffer.length,
      outSize: optimized.length,
    },
  };
}

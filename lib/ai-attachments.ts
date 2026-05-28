// Client-side image attachment plumbing for the AI composer. Resizes
// pasted/dropped/selected images down to a sane upper bound and re-
// encodes them to keep request bodies small while preserving enough
// resolution for vision-capable models. Animated GIFs are passed through
// uncompressed (within the byte budget) so the animation isn't dropped.

import type { AiAttachment } from "./types";

export const MAX_ATTACHMENTS = 4;

// Cap the longest edge of the resized image. 1568 mirrors Anthropic's
// vision recommendation; OpenAI / OpenRouter accept higher but the
// quality return per byte tails off quickly above this.
const MAX_IMAGE_DIMENSION = 1568;

// Final byte budget after re-encode. 1.5 MB keeps the request body
// reasonable for most providers and well under our server's 6 MB cap.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export async function fileToImageAttachment(file: File): Promise<AiAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not an image file");
  }
  // Animated GIFs lose animation when re-encoded via canvas. Keep them
  // as-is if they're already under the byte budget; otherwise reject so
  // we don't silently freeze the first frame.
  if (file.type === "image/gif") {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("GIF too large — must be under 1.5 MB");
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      kind: "image",
      dataUrl,
      mimeType: "image/gif",
      name: file.name,
    };
  }

  const bitmap = await loadImageBitmap(file);
  const { width, height } = fitWithin(
    bitmap.width,
    bitmap.height,
    MAX_IMAGE_DIMENSION
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // Try the most efficient codec first; fall back to lossier JPEG until
  // we land under the byte budget or run out of options.
  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  const candidates: Array<{ mime: string; quality: number }> = hasAlpha
    ? [
        { mime: "image/webp", quality: 0.85 },
        { mime: "image/png", quality: 1 },
      ]
    : [
        { mime: "image/jpeg", quality: 0.85 },
        { mime: "image/jpeg", quality: 0.7 },
        { mime: "image/jpeg", quality: 0.55 },
      ];

  let best: { dataUrl: string; mime: string; bytes: number } | null = null;
  for (const cand of candidates) {
    const dataUrl = canvas.toDataURL(cand.mime, cand.quality);
    const bytes = approxDataUrlBytes(dataUrl);
    if (!best || bytes < best.bytes) {
      best = { dataUrl, mime: cand.mime, bytes };
    }
    if (bytes <= MAX_IMAGE_BYTES) break;
  }
  if (!best) throw new Error("failed to encode image");
  if (best.bytes > MAX_IMAGE_BYTES) {
    throw new Error("image is too large after compression");
  }
  return {
    kind: "image",
    dataUrl: best.dataUrl,
    mimeType: best.mime,
    name: file.name,
    width: canvas.width,
    height: canvas.height,
  };
}

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is faster and avoids the load-event dance, but
  // some Safari versions and older Electrons trip on AVIF / HEIF. Fall
  // back to <img> with object URL on failure.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadImageElement(file));
  }
  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("couldn't decode image"));
    };
    img.src = objectUrl;
  });
}

function fitWithin(
  w: number,
  h: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const ratio = maxEdge / longest;
  return { width: w * ratio, height: h * ratio };
}

function approxDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Shape the wire payload for `/api/ai`. `name`/dimensions are local UX
 * state — only the dataUrl + mime are forwarded to the model.
 */
export function attachmentsForWire(
  atts: AiAttachment[] | undefined
): Array<{ kind: "image"; dataUrl: string; mimeType: string }> | undefined {
  if (!atts || atts.length === 0) return undefined;
  return atts.map((a) => ({
    kind: a.kind,
    dataUrl: a.dataUrl,
    mimeType: a.mimeType,
  }));
}

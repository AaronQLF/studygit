"use client";

// Shared orchestration for attaching a SourcePicker row as an
// `AiSourceRef`. Both the AI conversation node and the Study Buddy dock
// used to inline the same optimistic whole-PDF flow — show an
// "extracting…" chip, run pdf.js, then swap in the extracted text (or an
// error). That flow lived in three near-identical copies; this is the
// single implementation.
//
// Callers stay in control of *where* the ref is written (append to a
// node's sources, replace a chip by sid, push an extra source on the
// buddy, …) by passing the three writers below. The sentinel-excerpt
// encoding for the extracting/error chip states is owned here + in
// AiSourcesStrip so callers never touch the magic strings.

import { useStore } from "@/lib/store";
import {
  rowToSourceRef,
  rowToSourceRefAsync,
  type SourceRow,
} from "@/lib/source-rows";
import {
  ERROR_SENTINEL_PREFIX,
  EXTRACTING_SENTINEL,
} from "@/components/panels/ai/AiSourcesStrip";
import type { AiSourceRef } from "@/lib/types";

export type SourceAttachWriters = {
  // Write the initial ref. For non-PDF rows this is the final ref; for
  // whole-PDF rows it carries the "extracting…" sentinel until pdf.js
  // resolves. Callers decide whether this inserts a new chip or replaces
  // an existing one (by sid).
  write: (ref: AiSourceRef) => void;
  // Whole-PDF only: replace the ref identified by `sid` once extraction
  // resolves.
  resolve: (sid: string, ref: AiSourceRef) => void;
  // Whole-PDF only: mark the ref identified by `sid` as errored. The
  // excerpt is pre-encoded with the error sentinel so the chip renders
  // the failure state.
  fail: (sid: string, errorExcerpt: string) => void;
};

export function attachSourceRow(
  row: SourceRow,
  sid: string,
  writers: SourceAttachWriters
): void {
  const sourceNode =
    useStore.getState().nodes.find((n) => n.id === row.sourceNodeId) ?? null;
  const placeholder = rowToSourceRef(row, sourceNode);

  if (row.kind === "pdf-whole") {
    writers.write({ ...placeholder, sid, excerpt: EXTRACTING_SENTINEL });
    void rowToSourceRefAsync(row, sourceNode)
      .then((finalRef) => writers.resolve(sid, { ...finalRef, sid }))
      .catch((err: Error) =>
        writers.fail(
          sid,
          `${ERROR_SENTINEL_PREFIX}${err?.message ?? "Failed to extract PDF"}`
        )
      );
    return;
  }

  writers.write({ ...placeholder, sid });
}

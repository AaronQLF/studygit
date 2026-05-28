"use client";

// Owns the bridge between our Zustand store and React Flow's local
// nodes/edges state for the currently-active workspace. Has two paths:
//
//   1. A *signature* of "ids that exist + the citation pills they point
//      at" lets us take a fast path when only `data` references changed
//      (e.g. text edits, highlight added) and skip the full rebuild —
//      otherwise React Flow re-creates DOM for every node on every
//      keystroke.
//   2. On a structural change (node added/removed/edge added/removed/
//      citation pill added or removed) we rebuild the canonical lists
//      and tell React Flow to swap them in.
//
// The hook also auto-centers the canvas once per workspace the first
// time it has nodes — keeps the first impression friendly without
// fighting the user's pan/zoom afterwards.

import { useEffect, useRef } from "react";
import { MarkerType, useReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  buildCitationEdges,
  citationSignature,
} from "@/lib/citation-edges";
import type { CanvasEdge, CanvasNode } from "@/lib/types";

export type UseCanvasStoreSyncOptions = {
  selectedWorkspaceId: string | null;
  storeNodes: CanvasNode[];
  storeEdges: CanvasEdge[];
  setNodes: (
    update: Node[] | ((prev: Node[]) => Node[])
  ) => void;
  setEdges: (
    update: Edge[] | ((prev: Edge[]) => Edge[])
  ) => void;
};

export function useCanvasStoreSync({
  selectedWorkspaceId,
  storeNodes,
  storeEdges,
  setNodes,
  setEdges,
}: UseCanvasStoreSyncOptions) {
  const { setCenter } = useReactFlow();
  const centerOnceByWorkspace = useRef<Record<string, boolean>>({});
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setNodes([]);
      setEdges([]);
      lastSignatureRef.current = `${selectedWorkspaceId}`;
      return;
    }
    const wsNodes = storeNodes;
    const wsEdges = storeEdges;
    const citationEdges = buildCitationEdges(wsNodes);
    const signature =
      selectedWorkspaceId +
      "|" +
      wsNodes
        .map((n) => n.id)
        .sort()
        .join(",") +
      "|" +
      wsEdges
        .map((e) => e.id)
        .sort()
        .join(",") +
      "|c:" +
      citationSignature(wsNodes);

    if (signature === lastSignatureRef.current) {
      // Fast path: structure hasn't changed, only `data` references did
      // (e.g. text edits, highlight added). Reuse the existing React Flow
      // nodes array and only swap the per-node `data` refs whose identity
      // actually changed.
      setNodes((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          const src = wsNodes.find((x) => x.id === n.id);
          if (!src) return n;
          const srcData = src.data as unknown as Record<string, unknown>;
          if (n.data === srcData) return n;
          changed = true;
          return { ...n, data: srcData };
        });
        return changed ? next : prev;
      });
      return;
    }
    lastSignatureRef.current = signature;

    setNodes(
      wsNodes.map<Node>((n) => ({
        id: n.id,
        type: n.data.kind,
        position: n.position,
        data: n.data as unknown as Record<string, unknown>,
        width: n.width,
        height: n.height,
        // Shapes are organizational backdrops, so they always sit behind
        // the content nodes regardless of insertion order.
        zIndex: n.data.kind === "shape" ? 0 : 10,
      }))
    );
    const storedEdges = wsEdges.map<Edge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      style: { stroke: "var(--pg-border-strong)", strokeWidth: 1.25 },
    }));
    const derivedEdges = citationEdges.map<Edge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "bezier",
      animated: false,
      selectable: false,
      deletable: false,
      data: { kind: "citation" },
      style: {
        stroke: "var(--pg-accent)",
        strokeWidth: 1.25,
        strokeDasharray: "4 3",
        opacity: 0.85,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--pg-accent)",
        width: 14,
        height: 14,
      },
    }));
    setEdges([...storedEdges, ...derivedEdges]);

    if (
      !centerOnceByWorkspace.current[selectedWorkspaceId] &&
      wsNodes.length > 0
    ) {
      centerOnceByWorkspace.current[selectedWorkspaceId] = true;
      const centerX =
        wsNodes.reduce((sum, node) => sum + node.position.x, 0) /
        wsNodes.length;
      const centerY =
        wsNodes.reduce((sum, node) => sum + node.position.y, 0) /
        wsNodes.length;
      requestAnimationFrame(() => {
        setCenter(centerX, centerY, { duration: 260, zoom: 1 });
      });
    }
  }, [
    selectedWorkspaceId,
    storeNodes,
    storeEdges,
    setNodes,
    setEdges,
    setCenter,
  ]);
}

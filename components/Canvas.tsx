"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BezierEdge,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  FileSearch,
  Image as ImageIcon,
  Link2,
  NotebookPen,
  Shapes,
  StickyNote,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import { NOTE_COLORS, SHAPE_FILLS, SHAPE_STROKES } from "@/lib/defaults";
import { extractCitedNodeIds } from "@/lib/citations";
import type {
  AnyNodeData,
  CanvasNode,
  NodeKind,
} from "@/lib/types";
import { useToastStore } from "./Toast";
import { AddDock } from "./AddDock";
import { LinkNode } from "./nodes/LinkNode";
import { ImageNode } from "./nodes/ImageNode";
import { NoteNode } from "./nodes/NoteNode";
import { PageNode } from "./nodes/PageNode";
import { PdfNode } from "./nodes/PdfNode";
import { ShapeNode } from "./nodes/ShapeNode";

const nodeTypes = {
  link: LinkNode,
  image: ImageNode,
  note: NoteNode,
  page: PageNode,
  blog: PageNode,
  pdf: PdfNode,
  shape: ShapeNode,
};

// React Flow's built-in edge types are `default` (bezier-shaped),
// `straight`, `step`, `smoothstep`, `simplebezier`. We use `type: "bezier"`
// in our edge data for readability, so register it explicitly to avoid
// the "Edge type 'bezier' not found" warning + fallback to `default`.
const edgeTypes = {
  bezier: BezierEdge,
};

const KIND_LABELS: Record<NodeKind, string> = {
  link: "Link",
  image: "Image",
  note: "Note",
  page: "Page",
  blog: "Page",
  pdf: "PDF",
  shape: "Shape",
};

const KIND_ICONS: Record<NodeKind, React.ComponentType<{ size?: number }>> = {
  link: Link2,
  image: ImageIcon,
  note: StickyNote,
  page: NotebookPen,
  blog: NotebookPen,
  pdf: FileSearch,
  shape: Shapes,
};

/** Add-from-canvas palette order; excludes legacy `blog` (same UX as `page`). */
const CONTEXT_MENU_KINDS: NodeKind[] = [
  "link",
  "image",
  "note",
  "page",
  "pdf",
  "shape",
];

const CITATION_EDGE_PREFIX = "cite:";

type CitationEdge = {
  id: string;
  source: string;
  target: string;
};

// Every node kind that can be the *target* of a citation pill — i.e. that
// hosts highlight-anchored citations. PDFs and link/reader-view nodes
// qualify; pages, notes, etc. do not.
function isCitableTarget(node: CanvasNode): boolean {
  return node.data.kind === "pdf" || node.data.kind === "link";
}

// Every place inside a node where citation pills can be authored. Pages
// store their body as `content`; PDFs and links keep their notes in a
// separate `notes` field driven by the same RichTextEditor.
function citationSourceHtmls(node: CanvasNode): string[] {
  const data = node.data;
  if (data.kind === "page") return data.content ? [data.content] : [];
  if (data.kind === "pdf") return data.notes ? [data.notes] : [];
  if (data.kind === "link") return data.notes ? [data.notes] : [];
  return [];
}

function buildCitationEdges(wsNodes: CanvasNode[]): CitationEdge[] {
  const citableIds = new Set<string>();
  for (const n of wsNodes) {
    if (isCitableTarget(n)) citableIds.add(n.id);
  }
  if (citableIds.size === 0) return [];
  const edges: CitationEdge[] = [];
  const seen = new Set<string>();
  for (const n of wsNodes) {
    const sources = citationSourceHtmls(n);
    if (sources.length === 0) continue;
    for (const html of sources) {
      const targets = extractCitedNodeIds(html);
      for (const target of targets) {
        if (target === n.id) continue;
        if (!citableIds.has(target)) continue;
        const id = `${CITATION_EDGE_PREFIX}${n.id}->${target}`;
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ id, source: n.id, target });
      }
    }
  }
  return edges;
}

function citationSignature(wsNodes: CanvasNode[]): string {
  const parts: string[] = [];
  for (const n of wsNodes) {
    const sources = citationSourceHtmls(n);
    if (sources.length === 0) continue;
    const all = new Set<string>();
    for (const html of sources) {
      for (const id of extractCitedNodeIds(html)) all.add(id);
    }
    if (all.size === 0) continue;
    parts.push(`${n.id}:${Array.from(all).sort().join(",")}`);
  }
  return parts.sort().join("|");
}

function defaultDataFor(kind: NodeKind): AnyNodeData {
  switch (kind) {
    case "link":
      return { kind, url: "", title: "New link", highlights: [] };
    case "image":
      return { kind, url: "" };
    case "note":
      return { kind, text: "", color: NOTE_COLORS[0] };
    case "page":
      return {
        kind,
        title: "New page",
        content: "",
      };
    case "blog":
      return {
        kind: "page",
        title: "New page",
        content: "",
      };
    case "pdf":
      return {
        kind,
        title: "New PDF",
        src: "",
        highlights: [],
      };
    case "shape":
      return {
        kind,
        variant: "rounded",
        // Default to a soft amber fill with a matching warm border.
        fill: SHAPE_FILLS[1],
        stroke: SHAPE_STROKES[0],
        label: "",
      };
  }
}

function CanvasInner() {
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  // Workspace-filtered shallow subscriptions: only re-render when nodes or
  // edges *in the active workspace* change shape. The full store contains
  // every workspace's content; filtering here keeps switching workspaces
  // fast and stops noise from other workspaces from churning the canvas.
  const storeNodes = useStore(
    useShallow((s) =>
      s.nodes.filter((n) => n.workspaceId === s.selectedWorkspaceId)
    )
  );
  const storeEdges = useStore(
    useShallow((s) =>
      s.edges.filter((e) => e.workspaceId === s.selectedWorkspaceId)
    )
  );
  const addNodeStore = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNodeWithSnapshot = useStore((s) => s.deleteNodeWithSnapshot);
  const restoreDeletedNode = useStore((s) => s.restoreDeletedNode);
  const addEdgeStore = useStore((s) => s.addEdge);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const pushUndo = useToastStore((s) => s.pushUndo);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter } = useReactFlow();

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);

  const centerOnceByWorkspace = useRef<Record<string, boolean>>({});
  const lastSignatureRef = useRef<string>("");
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setNodes([]);
      setEdges([]);
      lastSignatureRef.current = `${selectedWorkspaceId}`;
      return;
    }
    // Already workspace-filtered upstream.
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
        // Shapes are organizational backdrops, so they always sit behind the
        // content nodes regardless of insertion order.
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

    if (!centerOnceByWorkspace.current[selectedWorkspaceId] && wsNodes.length > 0) {
      centerOnceByWorkspace.current[selectedWorkspaceId] = true;
      const centerX =
        wsNodes.reduce((sum, node) => sum + node.position.x, 0) / wsNodes.length;
      const centerY =
        wsNodes.reduce((sum, node) => sum + node.position.y, 0) / wsNodes.length;
      requestAnimationFrame(() => {
        setCenter(centerX, centerY, { duration: 260, zoom: 1 });
      });
    }
  }, [selectedWorkspaceId, storeNodes, storeEdges, setNodes, setEdges, setCenter]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeBase(changes);
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) {
          updateNode(c.id, { position: c.position });
        } else if (c.type === "remove") {
          const snapshot = deleteNodeWithSnapshot(c.id);
          if (snapshot) {
            pushUndo("Deleted node", () => restoreDeletedNode(snapshot));
          }
        } else if (c.type === "dimensions" && c.dimensions && !c.resizing) {
          updateNode(c.id, {
            width: c.dimensions.width,
            height: c.dimensions.height,
          });
        }
      }
    },
    [
      deleteNodeWithSnapshot,
      onNodesChangeBase,
      pushUndo,
      restoreDeletedNode,
      updateNode,
    ]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeBase(changes);
      for (const c of changes) {
        if (c.type === "remove" && !c.id.startsWith(CITATION_EDGE_PREFIX)) {
          deleteEdge(c.id);
        }
      }
    },
    [onEdgesChangeBase, deleteEdge]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!selectedWorkspaceId || !conn.source || !conn.target) return;
      addEdgeStore(selectedWorkspaceId, conn.source, conn.target);
    },
    [selectedWorkspaceId, addEdgeStore]
  );

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      if (!selectedWorkspaceId) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      const centerPos =
        rect &&
        screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      const pos =
        position ?? {
          x: centerPos?.x ?? 120 + Math.random() * 120,
          y: centerPos?.y ?? 120 + Math.random() * 120,
        };
      addNodeStore(selectedWorkspaceId, defaultDataFor(kind), pos);
    },
    [selectedWorkspaceId, addNodeStore, screenToFlowPosition]
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!wrapperRef.current || !selectedWorkspaceId) return;
      const mouseEvent = event as MouseEvent;
      const flowPos = screenToFlowPosition({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      });
      setContextMenu({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        flowPos,
      });
    },
    [screenToFlowPosition, selectedWorkspaceId]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping) {
        return;
      }
      const key = event.key.toLowerCase();
      const map: Record<string, NodeKind> = {
        l: "link",
        i: "image",
        n: "note",
        b: "page",
        p: "pdf",
        s: "shape",
      };
      const kind = map[key];
      if (!kind) return;
      event.preventDefault();
      addNode(kind);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addNode]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNode(selected[0]?.id ?? null);
    },
    [setSelectedNode]
  );

  const nodeColor = useMemo(() => "var(--pg-muted-soft)", []);

  if (!selectedWorkspaceId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--pg-muted)] text-sm bg-[var(--pg-bg-canvas)]">
        <div className="text-[var(--pg-fg-soft)] text-[14px] font-medium">No workspace selected</div>
        <div className="text-[12px]">Select or create a workspace to start building your canvas.</div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex-1 h-full w-full bg-[var(--pg-bg-canvas)]"
    >
      <AddDock onAdd={(k) => addNode(k)} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => setContextMenu(null)}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "bezier",
          style: { stroke: "var(--pg-border-strong)", strokeWidth: 1.25 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--pg-border-strong)",
            width: 14,
            height: 14,
          },
        }}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "var(--pg-accent)", strokeWidth: 1.25 }}
        minZoom={0.1}
        maxZoom={3}
        colorMode="light"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={0.8}
          className={zoom > 0.6 ? "pg-flow-dots" : "pg-flow-dots-hidden"}
          color="color-mix(in srgb, var(--pg-muted-soft) 56%, transparent)"
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="color-mix(in srgb, var(--pg-bg-canvas) 70%, transparent)"
          nodeColor={() => nodeColor}
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--pg-bg)] border border-[var(--pg-border)] rounded-md shadow-[var(--pg-shadow)] p-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          {CONTEXT_MENU_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <button
                key={kind}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[13px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
                onClick={() => addNode(kind, contextMenu.flowPos)}
              >
                <Icon size={14} />
                Add {KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

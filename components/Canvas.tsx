"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
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
import clsx from "clsx";
import {
  Crosshair,
  ExternalLink,
  FileSearch,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  NotebookPen,
  Plus,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { NOTE_COLORS } from "@/lib/defaults";
import type {
  AnyNodeData,
  DocumentNodeData,
  ImageNodeData,
  LinkNodeData,
  NoteNodeData,
  NodeKind,
  PageNodeData,
  PdfNodeData,
} from "@/lib/types";
import { useToastStore } from "./Toast";
import { AddDock } from "./AddDock";
import { LinkNode } from "./nodes/LinkNode";
import { ImageNode } from "./nodes/ImageNode";
import { NoteNode } from "./nodes/NoteNode";
import { PageNode } from "./nodes/PageNode";
import { DocumentNode } from "./nodes/DocumentNode";
import { PdfNode } from "./nodes/PdfNode";

const nodeTypes = {
  link: LinkNode,
  image: ImageNode,
  note: NoteNode,
  page: PageNode,
  blog: PageNode,
  document: DocumentNode,
  pdf: PdfNode,
};

const KIND_LABELS: Record<NodeKind, string> = {
  link: "Link",
  image: "Image",
  note: "Note",
  page: "Page",
  blog: "Page",
  document: "Document",
  pdf: "PDF",
};

const KIND_ICONS: Record<NodeKind, React.ComponentType<{ size?: number }>> = {
  link: Link2,
  image: ImageIcon,
  note: StickyNote,
  page: NotebookPen,
  blog: NotebookPen,
  document: FileText,
  pdf: FileSearch,
};

function defaultDataFor(kind: NodeKind): AnyNodeData {
  switch (kind) {
    case "link":
      return { kind, url: "", title: "New link", embed: true };
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
    case "document":
      return {
        kind,
        title: "New document",
        content: "",
        highlights: [],
      };
    case "pdf":
      return {
        kind,
        title: "New PDF",
        src: "",
        highlights: [],
      };
  }
}

function AddMenu({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-4 left-4 z-10">
      <button
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-white shadow-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={14} /> Add
      </button>
      {open && (
        <div className="mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[160px]">
          {(Object.keys(KIND_LABELS) as NodeKind[]).map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <button
                key={kind}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                onClick={() => {
                  onAdd(kind);
                  setOpen(false);
                }}
              >
                <Icon size={14} />
                {KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NodePreview() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const openPanel = useStore((s) => s.openPanel);
  const nodes = useStore((s) => s.nodes);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const node = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, nodes]
  );

  useEffect(() => {
    setDismissed(null);
  }, [selectedNodeId]);

  if (!node || focusedNodeId || dismissed === selectedNodeId) return null;

  const data = node.data;
  const Icon = KIND_ICONS[data.kind];

  const renderPreviewContent = () => {
    switch (data.kind) {
      case "note": {
        const d = data as NoteNodeData;
        return (
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 h-8 w-8 shrink-0 rounded-md"
              style={{ backgroundColor: d.color }}
            />
            <p className="text-[13px] text-zinc-300 line-clamp-3 leading-relaxed">
              {d.text || <span className="italic text-zinc-500">Empty note</span>}
            </p>
          </div>
        );
      }
      case "link": {
        const d = data as LinkNodeData;
        let hostname = "";
        try {
          const url = d.url.trim();
          hostname = url ? new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "") : "";
        } catch { hostname = d.url; }
        return (
          <div className="space-y-1">
            <div className="text-sm font-medium text-zinc-100">{d.title || "Untitled link"}</div>
            {d.description && <p className="text-[12px] text-zinc-400 line-clamp-2">{d.description}</p>}
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
              <ExternalLink size={10} /> {hostname}
            </div>
          </div>
        );
      }
      case "image": {
        const d = data as ImageNodeData;
        return d.url ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.url}
              alt={d.caption ?? ""}
              className="h-16 w-20 shrink-0 rounded-md object-cover bg-[var(--pg-bg-elevated)] border border-[var(--pg-border)]"
            />
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 truncate">{d.caption || "Image"}</p>
              <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">{d.url}</p>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500 italic">No image URL set</p>
        );
      }
      case "page":
      case "blog": {
        const d = data as PageNodeData;
        const html = d.content || "<em>Empty</em>";
        return (
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-zinc-100">{d.title || "Untitled"}</div>
            <div
              className="pg-prose pg-prose-preview text-[12px] text-zinc-400 line-clamp-3"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      }
      case "document": {
        const d = data as DocumentNodeData;
        return (
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-zinc-100">{d.title || "Untitled"}</div>
            <p className="text-[12px] text-zinc-400 line-clamp-3 leading-relaxed">
              {d.content.slice(0, 200) || <span className="italic text-zinc-500">Empty document</span>}
            </p>
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
              <span className="inline-flex items-center gap-1"><Highlighter size={10} /> {d.highlights.length}</span>
              <span className="inline-flex items-center gap-1"><MessageSquare size={10} /> {d.highlights.reduce((s, h) => s + h.comments.length, 0)}</span>
            </div>
          </div>
        );
      }
      case "pdf": {
        const d = data as PdfNodeData;
        return (
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-zinc-100">{d.title || d.fileName || "Untitled PDF"}</div>
            {d.fileName && <p className="text-[11px] font-mono text-zinc-500 truncate">{d.fileName}</p>}
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
              {typeof d.pageCount === "number" && <span className="inline-flex items-center gap-1"><FileText size={10} /> {d.pageCount}p</span>}
              <span className="inline-flex items-center gap-1"><Highlighter size={10} /> {d.highlights.length}</span>
              <span className="inline-flex items-center gap-1"><Sparkles size={10} /> {d.highlights.reduce((s, h) => s + h.aiThread.length, 0)}</span>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div
      className={clsx(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[320px] rounded-xl border border-[var(--pg-border)] bg-[color-mix(in_srgb,var(--pg-bg-subtle)_92%,transparent)] backdrop-blur-lg shadow-[0_16px_48px_rgba(0,0,0,0.35)] overflow-hidden",
        "animate-in fade-in slide-in-from-bottom-2 duration-150"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--pg-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
          <Icon size={11} />
          {KIND_LABELS[data.kind]} preview
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-[var(--pg-bg-elevated)]"
            onClick={() => openPanel(node.id)}
          >
            <Crosshair size={10} /> open
          </button>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-[var(--pg-bg-elevated)]"
            onClick={() => setDismissed(selectedNodeId)}
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="px-3 py-3 max-h-[200px] overflow-y-auto">
        {renderPreviewContent()}
      </div>
      <div className="px-3 py-1.5 border-t border-[var(--pg-border)] text-[10px] font-mono text-zinc-600 flex items-center justify-between">
        <span>double-click or enter to open</span>
        <span>esc to dismiss</span>
      </div>
    </div>
  );
}

function CanvasInner() {
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  const storeNodes = useStore((s) => s.nodes);
  const storeEdges = useStore((s) => s.edges);
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
    const wsNodes = storeNodes.filter(
      (n) => n.workspaceId === selectedWorkspaceId
    );
    const wsEdges = storeEdges.filter(
      (e) => e.workspaceId === selectedWorkspaceId
    );
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
        .join(",");

    if (signature === lastSignatureRef.current) {
      setNodes((prev) =>
        prev.map((n) => {
          const src = wsNodes.find((x) => x.id === n.id);
          if (!src) return n;
          return {
            ...n,
            data: src.data as unknown as Record<string, unknown>,
          };
        })
      );
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
      }))
    );
    setEdges(
      wsEdges.map<Edge>((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      }))
    );

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
        if (c.type === "remove") deleteEdge(c.id);
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
        d: "document",
        p: "pdf",
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

  const nodeColor = useMemo(() => "#52525b", []);

  if (!selectedWorkspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
        Select or create a workspace to start building your canvas.
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex-1 h-full w-full bg-[var(--pg-bg)]"
    >
      <AddMenu onAdd={(k) => addNode(k)} />
      <AddDock onAdd={(k) => addNode(k)} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
          style: { stroke: "#52525b", strokeWidth: 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#52525b",
            width: 14,
            height: 14,
          },
        }}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "#71717a", strokeWidth: 1 }}
        minZoom={0.1}
        maxZoom={3}
        colorMode="system"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className={zoom > 0.6 ? "pg-flow-dots" : "pg-flow-dots-hidden"}
          color="currentColor"
        />
        <Controls showInteractive={false} className="!shadow-sm" />
        <MiniMap
          pannable
          zoomable
          className="!bg-[var(--pg-bg-subtle)] !border !border-[var(--pg-border)] !rounded-md"
          maskColor="rgba(0,0,0,0.05)"
          nodeColor={() => nodeColor}
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--pg-bg-subtle)] border border-[var(--pg-border)] rounded-md shadow-[var(--pg-shadow)] py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          {(Object.keys(KIND_LABELS) as NodeKind[]).map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <button
                key={kind}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-[var(--pg-bg-elevated)]"
                onClick={() => addNode(kind, contextMenu.flowPos)}
              >
                <Icon size={14} />
                Add {KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
      )}

      <NodePreview />
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

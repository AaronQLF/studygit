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
import {
  BookOpen,
  FileSearch,
  FileText,
  Image as ImageIcon,
  Link2,
  Plus,
  StickyNote,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { NOTE_COLORS } from "@/lib/defaults";
import type { AnyNodeData, NodeKind } from "@/lib/types";
import { useToastStore } from "./Toast";
import { AddDock } from "./AddDock";
import { LinkNode } from "./nodes/LinkNode";
import { ImageNode } from "./nodes/ImageNode";
import { NoteNode } from "./nodes/NoteNode";
import { BlogNode } from "./nodes/BlogNode";
import { DocumentNode } from "./nodes/DocumentNode";
import { PdfNode } from "./nodes/PdfNode";

const nodeTypes = {
  link: LinkNode,
  image: ImageNode,
  note: NoteNode,
  blog: BlogNode,
  document: DocumentNode,
  pdf: PdfNode,
};

const KIND_LABELS: Record<NodeKind, string> = {
  link: "Link",
  image: "Image",
  note: "Note",
  blog: "Blog",
  document: "Document",
  pdf: "PDF",
};

const KIND_ICONS: Record<NodeKind, React.ComponentType<{ size?: number }>> = {
  link: Link2,
  image: ImageIcon,
  note: StickyNote,
  blog: BookOpen,
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
    case "blog":
      return {
        kind,
        title: "New blog post",
        markdown: "# New blog post\n\nStart writing here...",
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

function CanvasInner() {
  const selectedFolderId = useStore((s) => s.selectedFolderId);
  const storeNodes = useStore((s) => s.nodes);
  const storeEdges = useStore((s) => s.edges);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
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

  const centerOnceByFolder = useRef<Record<string, boolean>>({});
  const lastSignatureRef = useRef<string>("");
  useEffect(() => {
    if (!selectedFolderId) {
      setNodes([]);
      setEdges([]);
      lastSignatureRef.current = `${selectedFolderId}`;
      return;
    }
    const folderNodes = storeNodes.filter(
      (n) => n.folderId === selectedFolderId
    );
    const folderEdges = storeEdges.filter(
      (e) => e.folderId === selectedFolderId
    );
    const signature =
      selectedFolderId +
      "|" +
      folderNodes
        .map((n) => n.id)
        .sort()
        .join(",") +
      "|" +
      folderEdges
        .map((e) => e.id)
        .sort()
        .join(",");

    if (signature === lastSignatureRef.current) {
      // IDs haven't changed — just merge the latest `data` into existing
      // xyflow nodes so node components re-render with fresh props without
      // losing measurement state.
      setNodes((prev) =>
        prev.map((n) => {
          const src = folderNodes.find((x) => x.id === n.id);
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
      folderNodes.map<Node>((n) => ({
        id: n.id,
        type: n.data.kind,
        position: n.position,
        data: n.data as unknown as Record<string, unknown>,
        width: n.width,
        height: n.height,
      }))
    );
    setEdges(
      folderEdges.map<Edge>((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      }))
    );

    if (!centerOnceByFolder.current[selectedFolderId] && folderNodes.length > 0) {
      centerOnceByFolder.current[selectedFolderId] = true;
      const centerX =
        folderNodes.reduce((sum, node) => sum + node.position.x, 0) / folderNodes.length;
      const centerY =
        folderNodes.reduce((sum, node) => sum + node.position.y, 0) / folderNodes.length;
      requestAnimationFrame(() => {
        setCenter(centerX, centerY, { duration: 260, zoom: 1 });
      });
    }
  }, [selectedFolderId, storeNodes, storeEdges, setNodes, setEdges]);

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
      if (!selectedFolderId || !conn.source || !conn.target) return;
      addEdgeStore(selectedFolderId, conn.source, conn.target);
    },
    [selectedFolderId, addEdgeStore]
  );

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      if (!selectedFolderId) return;
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
      addNodeStore(selectedFolderId, defaultDataFor(kind), pos);
    },
    [selectedFolderId, addNodeStore, screenToFlowPosition]
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!wrapperRef.current || !selectedFolderId) return;
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
    [screenToFlowPosition, selectedFolderId]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping || focusedNodeId) {
        return;
      }
      const key = event.key.toLowerCase();
      const map: Record<string, NodeKind> = {
        l: "link",
        i: "image",
        n: "note",
        b: "blog",
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
  }, [addNode, focusedNodeId]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNode(selected[0]?.id ?? null);
    },
    [setSelectedNode]
  );

  const nodeColor = useMemo(() => "#52525b", []);

  if (!selectedFolderId) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
        Select or create a folder to start building your canvas.
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

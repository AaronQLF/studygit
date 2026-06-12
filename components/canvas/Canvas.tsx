"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import { CITATION_EDGE_PREFIX } from "@/lib/citation-edges";
import { DENSITY_GAP, STYLE_SIZE, useGridPrefs } from "@/lib/canvas-grid";
import type { NodeKind } from "@/lib/types";
import { useToastStore } from "@/components/ui/Toast";
import { AddDock } from "@/components/shell/AddDock";
import { defaultDataFor } from "./node-defaults";
import { COMPACT_ZOOM_THRESHOLD } from "./nodes/NodeShell";
import { EmptyCanvas } from "./EmptyCanvas";
import { edgeTypes, nodeTypes } from "./node-types";
import type { TemplateDef } from "@/lib/templates";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useCanvasShortcuts } from "./useCanvasShortcuts";
import { useCanvasStoreSync } from "./useCanvasStoreSync";

function CanvasInner() {
  const selectedWorkspaceId = useStore((s) => s.selectedWorkspaceId);
  // Workspace-filtered shallow subscriptions: only re-render when nodes
  // or edges *in the active workspace* change shape. The full store
  // contains every workspace's content; filtering here keeps switching
  // workspaces fast and stops noise from other workspaces from churning
  // the canvas.
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
  const applyTemplate = useStore((s) => s.applyTemplate);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const pushUndo = useToastStore((s) => s.pushUndo);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getZoom } = useReactFlow();

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [zoom, setZoom] = useState(1);
  const grid = useGridPrefs();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);

  useCanvasStoreSync({
    selectedWorkspaceId,
    storeNodes,
    storeEdges,
    setNodes,
    setEdges,
  });

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
          // Below the LOD threshold nodes render as compact chips — their
          // measured size is a presentation artifact, not user intent, so
          // persisting it would corrupt stored card dimensions (and churn
          // a save on every zoom crossing). Also skip no-op writes: RF
          // re-emits measurements when crossing back even when the values
          // match what's stored.
          if (getZoom() < COMPACT_ZOOM_THRESHOLD) continue;
          const existing = storeNodes.find((n) => n.id === c.id);
          if (
            existing &&
            existing.width === c.dimensions.width &&
            existing.height === c.dimensions.height
          ) {
            continue;
          }
          updateNode(c.id, {
            width: c.dimensions.width,
            height: c.dimensions.height,
          });
        }
      }
    },
    [
      deleteNodeWithSnapshot,
      getZoom,
      onNodesChangeBase,
      pushUndo,
      restoreDeletedNode,
      storeNodes,
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

  const onApplyTemplate = useCallback(
    (template: TemplateDef) => {
      if (!selectedWorkspaceId) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      // Anchor near the top-left of the visible canvas so a multi-node
      // template lays out into view rather than off the right edge.
      const origin =
        rect &&
        screenToFlowPosition({
          x: rect.left + Math.min(220, rect.width * 0.22),
          y: rect.top + Math.min(180, rect.height * 0.24),
        });
      applyTemplate(
        selectedWorkspaceId,
        template,
        origin ?? { x: 120, y: 120 }
      );
    },
    [selectedWorkspaceId, applyTemplate, screenToFlowPosition]
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

  useCanvasShortcuts({ nodes, addNode, onNodesChange });

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
        <div className="text-[var(--pg-fg-soft)] text-[14px] font-medium">
          No workspace selected
        </div>
        <div className="text-[12px]">
          Select or create a workspace to start building your canvas.
        </div>
      </div>
    );
  }

  return (
    // `absolute inset-0` (vs. the previous `flex-1 h-full w-full`) gives
    // the wrapper a guaranteed pixel size from its positioned parent the
    // moment it mounts, so React Flow's `useResizeHandler` doesn't fire
    // `error004` on the transient 0×0 frame between the dynamic-loading
    // fallback unmounting and the canvas hydrating.
    <div
      ref={wrapperRef}
      className="absolute inset-0 bg-[var(--pg-bg-canvas)]"
    >
      <AddDock onAdd={(k) => addNode(k)} />
      {nodes.length === 0 ? <EmptyCanvas onPick={onApplyTemplate} /> : null}
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
        onError={(code, message) => {
          // 004 = "parent container needs width and height". React Flow's
          // ResizeObserver still occasionally measures 0×0 during the
          // brief window between dynamic mount and first layout commit
          // even after the sizing fix above; treat that single transient
          // warning as informational.
          if (code === "004") return;
          console.warn(`[React Flow] (${code}) ${message}`);
        }}
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
        connectionLineStyle={{
          stroke: "var(--pg-accent)",
          strokeWidth: 1.25,
        }}
        minZoom={0.1}
        maxZoom={3}
        colorMode="light"
        // Disable React Flow's built-in delete-on-keypress; replaced by
        // the scoped handler in useCanvasShortcuts that won't fire
        // inside panel content (TipTap editors, PDF viewers, etc.).
        deleteKeyCode={null}
      >
        {grid.style !== "none" ? (
          <Background
            // `key` forces React Flow to remount the SVG defs when the
            // variant changes; without it switching styles can leave
            // the previous pattern lingering until the next viewport
            // change.
            key={grid.style}
            variant={
              grid.style === "lines"
                ? BackgroundVariant.Lines
                : grid.style === "cross"
                  ? BackgroundVariant.Cross
                  : BackgroundVariant.Dots
            }
            gap={DENSITY_GAP[grid.density]}
            size={STYLE_SIZE[grid.style]}
            className={zoom > 0.6 ? "pg-flow-grid" : "pg-flow-grid-hidden"}
            color="color-mix(in srgb, var(--pg-muted-soft) 56%, transparent)"
          />
        ) : null}
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

      {contextMenu ? (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          flowPos={contextMenu.flowPos}
          onAdd={(kind, pos) => addNode(kind, pos)}
          onDismiss={() => setContextMenu(null)}
        />
      ) : null}
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

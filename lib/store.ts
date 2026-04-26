"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  AiMessage,
  AnyNodeData,
  AppState,
  CanvasEdge,
  CanvasNode,
  Comment,
  FloatingPanel,
  Highlight,
  PdfHighlight,
  PdfHighlightRect,
  Workspace,
} from "./types";
import { DEFAULT_WORKSPACE_ID, INITIAL_STATE } from "./defaults";
import { migrateNode } from "./migrations";

type LegacyFolder = {
  id: string;
  name: string;
  parentId: string | null;
  workspaceId?: string;
  createdAt: number;
};

type LegacyNode = CanvasNode & { folderId?: string };
type LegacyEdge = CanvasEdge & { folderId?: string };
type LegacyAppState = Partial<AppState> & {
  folders?: LegacyFolder[];
  selectedFolderId?: string | null;
  nodes?: LegacyNode[];
  edges?: LegacyEdge[];
};

export type DeletedNodeSnapshot = {
  node: CanvasNode;
  edges: CanvasEdge[];
};

type Store = AppState & {
  hydrated: boolean;
  error: string | null;
  isDirty: boolean;
  justSaved: boolean;
  lastSavedAt: number | null;
  panels: FloatingPanel[];
  focusedNodeId: string | null;
  selectedNodeId: string | null;
  sidebarCollapsed: boolean;

  hydrate: () => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  focusNode: (id: string) => void;
  clearFocus: () => void;
  setSelectedNode: (id: string | null) => void;

  openPanel: (nodeId: string) => string;
  closePanel: (panelId: string) => void;
  closeAllPanels: () => void;
  closePanelsForNode: (nodeId: string) => void;
  bringPanelFront: (panelId: string) => void;
  movePanel: (panelId: string, x: number, y: number) => void;
  resizePanel: (panelId: string, width: number, height: number) => void;
  togglePanelMaximize: (panelId: string) => void;

  createWorkspace: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  selectWorkspace: (id: string) => void;

  addNode: (
    workspaceId: string,
    data: AnyNodeData,
    position: { x: number; y: number }
  ) => string;
  duplicateNode: (id: string) => string | null;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, patch: Partial<AnyNodeData>) => void;
  deleteNode: (id: string) => void;
  deleteNodeWithSnapshot: (id: string) => DeletedNodeSnapshot | null;
  restoreDeletedNode: (snapshot: DeletedNodeSnapshot) => void;

  addEdge: (workspaceId: string, source: string, target: string) => void;
  deleteEdge: (id: string) => void;

  addHighlight: (
    nodeId: string,
    start: number,
    end: number,
    color: string
  ) => string;
  deleteHighlight: (nodeId: string, highlightId: string) => void;
  addComment: (nodeId: string, highlightId: string, text: string) => void;
  deleteComment: (
    nodeId: string,
    highlightId: string,
    commentId: string
  ) => void;

  addPdfHighlight: (
    nodeId: string,
    page: number,
    rects: PdfHighlightRect[],
    text: string,
    color: string
  ) => string | null;
  deletePdfHighlight: (nodeId: string, highlightId: string) => void;
  addPdfComment: (
    nodeId: string,
    highlightId: string,
    text: string
  ) => void;
  deletePdfComment: (
    nodeId: string,
    highlightId: string,
    commentId: string
  ) => void;
  appendPdfAiMessage: (
    nodeId: string,
    highlightId: string,
    message: AiMessage
  ) => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let justSavedTimer: ReturnType<typeof setTimeout> | null = null;

const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 280;
const PANEL_MARGIN = 16;
const ADDITIVE_OFFSET = 32;

function viewportSize(): { vw: number; vh: number } {
  if (typeof window === "undefined") return { vw: 1280, vh: 800 };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

function defaultPanelGeom(existing: FloatingPanel[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { vw, vh } = viewportSize();
  const top = topOfStack(existing);
  if (!top) {
    // First panel: roomy but not full-bleed, so the canvas stays visible and
    // the user can tell additional panels can land beside it.
    const width = Math.max(
      PANEL_MIN_WIDTH,
      Math.min(1400, Math.floor(vw * 0.78))
    );
    const height = Math.max(
      PANEL_MIN_HEIGHT,
      Math.min(1100, Math.floor(vh * 0.85))
    );
    return {
      x: Math.max(PANEL_MARGIN, Math.floor((vw - width) / 2)),
      y: Math.max(PANEL_MARGIN, Math.floor((vh - height) / 2)),
      width,
      height,
    };
  }
  const width = Math.max(
    PANEL_MIN_WIDTH,
    Math.min(top.width, Math.floor(vw * 0.62))
  );
  const height = Math.max(
    PANEL_MIN_HEIGHT,
    Math.min(top.height, Math.floor(vh * 0.78))
  );
  let x = top.x + ADDITIVE_OFFSET;
  let y = top.y + ADDITIVE_OFFSET;
  if (x + width > vw - PANEL_MARGIN) {
    x = Math.max(PANEL_MARGIN, vw - PANEL_MARGIN - width);
  }
  if (y + height > vh - PANEL_MARGIN) {
    y = Math.max(PANEL_MARGIN, vh - PANEL_MARGIN - height);
  }
  return { x, y, width, height };
}

function topOfStack(panels: FloatingPanel[]): FloatingPanel | undefined {
  if (panels.length === 0) return undefined;
  let top = panels[0];
  for (let i = 1; i < panels.length; i++) {
    if (panels[i].z > top.z) top = panels[i];
  }
  return top;
}

function focusedNodeIdFromPanels(panels: FloatingPanel[]): string | null {
  return topOfStack(panels)?.nodeId ?? null;
}

function maxZ(panels: FloatingPanel[]): number {
  let z = 0;
  for (const p of panels) if (p.z > z) z = p.z;
  return z;
}

async function persistToServer(state: AppState): Promise<boolean> {
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    return true;
  } catch (err) {
    console.error("Failed to save state", err);
    return false;
  }
}

function scheduleSave(get: () => Store, set: (patch: Partial<Store>) => void) {
  set({ isDirty: true });
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    const s = get();
    const snapshot: AppState = {
      workspaces: s.workspaces,
      nodes: s.nodes,
      edges: s.edges,
      selectedWorkspaceId: s.selectedWorkspaceId,
      version: s.version + 1,
    };

    const ok = await persistToServer(snapshot);
    if (!ok) {
      set({
        error: "Failed to save state. Check your connection and retry.",
      });
      return;
    }

    if (justSavedTimer) clearTimeout(justSavedTimer);
    set({
      error: null,
      version: snapshot.version,
      isDirty: false,
      justSaved: true,
      lastSavedAt: Date.now(),
    });
    justSavedTimer = setTimeout(() => set({ justSaved: false }), 600);
  }, 400);
}

export const useStore = create<Store>((set, get) => ({
  ...INITIAL_STATE,
  hydrated: false,
  error: null,
  isDirty: false,
  justSaved: false,
  lastSavedAt: null,
  panels: [],
  focusedNodeId: null,
  selectedNodeId: null,
  sidebarCollapsed: false,

  hydrate: async () => {
    try {
      const res = await fetch("/api/state");
      const data = (await res.json()) as LegacyAppState;

      let workspaces: Workspace[] = data.workspaces ?? [];
      const legacyFolders: LegacyFolder[] = data.folders ?? [];
      const incomingNodes: LegacyNode[] = data.nodes ?? [];
      const incomingEdges: LegacyEdge[] = data.edges ?? [];

      const folderToWs = new Map<string, string>();
      const hadFolders = legacyFolders.length > 0;

      if (hadFolders) {
        const rootFolders = legacyFolders.filter((f) => !f.parentId);
        const parentToRootCache = new Map<string, string>();
        const findRoot = (folderId: string): string => {
          if (parentToRootCache.has(folderId)) {
            return parentToRootCache.get(folderId)!;
          }
          let cur: LegacyFolder | undefined = legacyFolders.find(
            (f) => f.id === folderId
          );
          while (cur && cur.parentId) {
            const parent: LegacyFolder | undefined = legacyFolders.find(
              (f) => f.id === cur!.parentId
            );
            if (!parent) break;
            cur = parent;
          }
          const rootId = cur?.id ?? folderId;
          parentToRootCache.set(folderId, rootId);
          return rootId;
        };

        for (const root of rootFolders) {
          const wsId = `ws-${root.id}`;
          if (!workspaces.some((w) => w.id === wsId)) {
            workspaces.push({
              id: wsId,
              name: root.name,
              createdAt: root.createdAt,
            });
          }
        }
        for (const f of legacyFolders) {
          folderToWs.set(f.id, `ws-${findRoot(f.id)}`);
        }
      }

      if (workspaces.length === 0) {
        workspaces = [
          {
            id: DEFAULT_WORKSPACE_ID,
            name: "Personal",
            createdAt: Date.now(),
          },
        ];
      }
      const validWsIds = new Set(workspaces.map((w) => w.id));
      const fallbackWsId = workspaces[0].id;

      let blogMigrated = false;
      const nodes: CanvasNode[] = incomingNodes.map((n) => {
        const wsId =
          n.workspaceId && validWsIds.has(n.workspaceId)
            ? n.workspaceId
            : (n.folderId && folderToWs.get(n.folderId)) || fallbackWsId;
        const { folderId: _legacy, ...rest } = n;
        void _legacy;
        const base: CanvasNode = { ...rest, workspaceId: wsId };
        const migrated = migrateNode(base);
        if (migrated.changed) blogMigrated = true;
        return migrated.node;
      });
      const edges: CanvasEdge[] = incomingEdges.map((e) => {
        const wsId =
          e.workspaceId && validWsIds.has(e.workspaceId)
            ? e.workspaceId
            : (e.folderId && folderToWs.get(e.folderId)) || fallbackWsId;
        const { folderId: _legacy, ...rest } = e;
        void _legacy;
        return { ...rest, workspaceId: wsId };
      });

      const selectedWorkspaceId =
        data.selectedWorkspaceId && validWsIds.has(data.selectedWorkspaceId)
          ? data.selectedWorkspaceId
          : (data.selectedFolderId &&
              folderToWs.get(data.selectedFolderId)) ||
            fallbackWsId;

      set({
        workspaces,
        nodes,
        edges,
        selectedWorkspaceId,
        version: data.version ?? 1,
        hydrated: true,
        isDirty: false,
        justSaved: false,
        lastSavedAt: Date.now(),
      });

      const needsMigration =
        hadFolders ||
        !data.workspaces ||
        blogMigrated ||
        incomingNodes.some((n) => !n.workspaceId) ||
        incomingEdges.some((e) => !e.workspaceId);
      if (needsMigration) scheduleSave(get, set);
    } catch (err) {
      set({
        error: (err as Error).message,
        hydrated: true,
      });
    }
  },

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  focusNode: (id) => {
    get().openPanel(id);
  },
  clearFocus: () => {
    get().closeAllPanels();
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  openPanel: (nodeId) => {
    const existing = get().panels.find((p) => p.nodeId === nodeId);
    if (existing) {
      get().bringPanelFront(existing.id);
      set({ selectedNodeId: nodeId });
      return existing.id;
    }
    const current = get().panels;
    const geom = defaultPanelGeom(current);
    const id = nanoid(8);
    const panel: FloatingPanel = {
      id,
      nodeId,
      ...geom,
      z: maxZ(current) + 1,
      maximized: false,
    };
    // Demaximize any maximized panel so a new floating panel doesn't get
    // hidden behind it.
    const next = current.map((p) =>
      p.maximized ? { ...p, maximized: false } : p
    );
    next.push(panel);
    set({
      panels: next,
      focusedNodeId: focusedNodeIdFromPanels(next),
      selectedNodeId: nodeId,
    });
    return id;
  },

  closePanel: (panelId) => {
    set((s) => {
      const next = s.panels.filter((p) => p.id !== panelId);
      return {
        panels: next,
        focusedNodeId: focusedNodeIdFromPanels(next),
      };
    });
  },

  closeAllPanels: () => set({ panels: [], focusedNodeId: null }),

  closePanelsForNode: (nodeId) => {
    set((s) => {
      const next = s.panels.filter((p) => p.nodeId !== nodeId);
      if (next.length === s.panels.length) return s;
      return {
        panels: next,
        focusedNodeId: focusedNodeIdFromPanels(next),
      };
    });
  },

  bringPanelFront: (panelId) => {
    set((s) => {
      const target = s.panels.find((p) => p.id === panelId);
      if (!target) return s;
      const top = maxZ(s.panels);
      if (target.z === top) {
        return { focusedNodeId: target.nodeId };
      }
      const next = s.panels.map((p) =>
        p.id === panelId ? { ...p, z: top + 1 } : p
      );
      return {
        panels: next,
        focusedNodeId: focusedNodeIdFromPanels(next),
      };
    });
  },

  movePanel: (panelId, x, y) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId ? { ...p, x, y, maximized: false } : p
      ),
    }));
  },

  resizePanel: (panelId, width, height) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId
          ? {
              ...p,
              width: Math.max(PANEL_MIN_WIDTH, width),
              height: Math.max(PANEL_MIN_HEIGHT, height),
              maximized: false,
            }
          : p
      ),
    }));
  },

  togglePanelMaximize: (panelId) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId ? { ...p, maximized: !p.maximized } : p
      ),
    }));
  },

  createWorkspace: (name) => {
    const id = nanoid(8);
    const ws: Workspace = { id, name, createdAt: Date.now() };
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      selectedWorkspaceId: id,
    }));
    scheduleSave(get, set);
    return id;
  },

  renameWorkspace: (id, name) => {
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    }));
    scheduleSave(get, set);
  },

  deleteWorkspace: (id) => {
    set((s) => {
      if (s.workspaces.length <= 1) return s;
      const remainingWorkspaces = s.workspaces.filter((w) => w.id !== id);
      const remainingNodes = s.nodes.filter((n) => n.workspaceId !== id);
      const remainingEdges = s.edges.filter((e) => e.workspaceId !== id);
      const remainingNodeIds = new Set(remainingNodes.map((n) => n.id));
      const remainingPanels = s.panels.filter((p) =>
        remainingNodeIds.has(p.nodeId)
      );
      const nextWsId =
        s.selectedWorkspaceId === id
          ? remainingWorkspaces[0]?.id ?? null
          : s.selectedWorkspaceId;
      return {
        workspaces: remainingWorkspaces,
        nodes: remainingNodes,
        edges: remainingEdges,
        selectedWorkspaceId: nextWsId,
        panels: remainingPanels,
        focusedNodeId: focusedNodeIdFromPanels(remainingPanels),
        selectedNodeId: null,
      };
    });
    scheduleSave(get, set);
  },

  selectWorkspace: (id) => {
    set((s) => {
      if (!s.workspaces.some((w) => w.id === id)) return s;
      return {
        selectedWorkspaceId: id,
        panels: [],
        focusedNodeId: null,
        selectedNodeId: null,
      };
    });
    scheduleSave(get, set);
  },

  addNode: (workspaceId, data, position) => {
    const id = nanoid(10);
    const node: CanvasNode = {
      id,
      workspaceId,
      position,
      data,
      width:
        data.kind === "blog" || data.kind === "page"
          ? 440
          : data.kind === "document"
          ? 360
          : data.kind === "pdf"
          ? 320
          : data.kind === "image"
          ? 280
          : 240,
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
    scheduleSave(get, set);
    return id;
  },

  duplicateNode: (id) => {
    const src = get().nodes.find((n) => n.id === id);
    if (!src) return null;
    const copyId = nanoid(10);
    const node: CanvasNode = {
      ...src,
      id: copyId,
      position: { x: src.position.x + 48, y: src.position.y + 36 },
      data: JSON.parse(JSON.stringify(src.data)) as AnyNodeData,
    };
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: copyId }));
    scheduleSave(get, set);
    return copyId;
  },

  updateNode: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
    scheduleSave(get, set);
  },

  updateNodeData: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, ...patch } as AnyNodeData } as CanvasNode)
          : n
      ),
    }));
    scheduleSave(get, set);
  },

  deleteNode: (id) => {
    get().deleteNodeWithSnapshot(id);
  },

  deleteNodeWithSnapshot: (id) => {
    const s = get();
    const node = s.nodes.find((n) => n.id === id);
    if (!node) return null;
    const edges = s.edges.filter((e) => e.source === id || e.target === id);
    const snapshot: DeletedNodeSnapshot = {
      node: JSON.parse(JSON.stringify(node)) as CanvasNode,
      edges: JSON.parse(JSON.stringify(edges)) as CanvasEdge[],
    };
    set((s) => {
      const nextPanels = s.panels.filter((p) => p.nodeId !== id);
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        panels: nextPanels,
        focusedNodeId: focusedNodeIdFromPanels(nextPanels),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      };
    });
    scheduleSave(get, set);
    return snapshot;
  },

  restoreDeletedNode: (snapshot) => {
    set((s) => {
      const hasNode = s.nodes.some((n) => n.id === snapshot.node.id);
      const hasEdges = new Set(s.edges.map((e) => e.id));
      return {
        nodes: hasNode ? s.nodes : [...s.nodes, snapshot.node],
        edges: [
          ...s.edges,
          ...snapshot.edges.filter((e) => !hasEdges.has(e.id)),
        ],
        selectedNodeId: snapshot.node.id,
      };
    });
    scheduleSave(get, set);
  },

  addEdge: (workspaceId, source, target) => {
    if (source === target) return;
    const exists = get().edges.some(
      (e) =>
        e.workspaceId === workspaceId &&
        e.source === source &&
        e.target === target
    );
    if (exists) return;
    const edge: CanvasEdge = {
      id: nanoid(8),
      workspaceId,
      source,
      target,
    };
    set((s) => ({ edges: [...s.edges, edge] }));
    scheduleSave(get, set);
  },

  deleteEdge: (id) => {
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }));
    scheduleSave(get, set);
  },

  addHighlight: (nodeId, start, end, color) => {
    const id = nanoid(8);
    const highlight: Highlight = {
      id,
      start,
      end,
      color,
      comments: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "document") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: [...n.data.highlights, highlight],
          },
        };
      }),
    }));
    scheduleSave(get, set);
    return id;
  },

  deleteHighlight: (nodeId, highlightId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "document") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.filter((h) => h.id !== highlightId),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  addComment: (nodeId, highlightId, text) => {
    const comment: Comment = {
      id: nanoid(8),
      text,
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "document") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.map((h) =>
              h.id === highlightId
                ? { ...h, comments: [...h.comments, comment] }
                : h
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  deleteComment: (nodeId, highlightId, commentId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "document") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.map((h) =>
              h.id === highlightId
                ? {
                    ...h,
                    comments: h.comments.filter((c) => c.id !== commentId),
                  }
                : h
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  addPdfHighlight: (nodeId, page, rects, text, color) => {
    const target = get().nodes.find((n) => n.id === nodeId);
    if (!target || target.data.kind !== "pdf") return null;
    const id = nanoid(8);
    const highlight: PdfHighlight = {
      id,
      page,
      rects,
      text,
      color,
      comments: [],
      aiThread: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "pdf") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: [...n.data.highlights, highlight],
          },
        };
      }),
    }));
    scheduleSave(get, set);
    return id;
  },

  deletePdfHighlight: (nodeId, highlightId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "pdf") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.filter((h) => h.id !== highlightId),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  addPdfComment: (nodeId, highlightId, text) => {
    const comment: Comment = {
      id: nanoid(8),
      text,
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "pdf") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.map((h) =>
              h.id === highlightId
                ? { ...h, comments: [...h.comments, comment] }
                : h
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  deletePdfComment: (nodeId, highlightId, commentId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "pdf") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.map((h) =>
              h.id === highlightId
                ? {
                    ...h,
                    comments: h.comments.filter((c) => c.id !== commentId),
                  }
                : h
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  appendPdfAiMessage: (nodeId, highlightId, message) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "pdf") return n;
        return {
          ...n,
          data: {
            ...n.data,
            highlights: n.data.highlights.map((h) =>
              h.id === highlightId
                ? { ...h, aiThread: [...h.aiThread, message] }
                : h
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },
}));

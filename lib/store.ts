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
  Folder,
  Highlight,
  PdfHighlight,
  PdfHighlightRect,
} from "./types";
import { INITIAL_STATE } from "./defaults";

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
  focusedNodeId: string | null;
  selectedNodeId: string | null;
  sidebarCollapsed: boolean;

  hydrate: () => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  focusNode: (id: string) => void;
  clearFocus: () => void;
  setSelectedNode: (id: string | null) => void;

  createFolder: (name: string, parentId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  selectFolder: (id: string | null) => void;

  addNode: (
    folderId: string,
    data: AnyNodeData,
    position: { x: number; y: number }
  ) => string;
  duplicateNode: (id: string) => string | null;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, patch: Partial<AnyNodeData>) => void;
  deleteNode: (id: string) => void;
  deleteNodeWithSnapshot: (id: string) => DeletedNodeSnapshot | null;
  restoreDeletedNode: (snapshot: DeletedNodeSnapshot) => void;

  addEdge: (folderId: string, source: string, target: string) => void;
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
      folders: s.folders,
      nodes: s.nodes,
      edges: s.edges,
      selectedFolderId: s.selectedFolderId,
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
  focusedNodeId: null,
  selectedNodeId: null,
  sidebarCollapsed: false,

  hydrate: async () => {
    try {
      const res = await fetch("/api/state");
      const data = (await res.json()) as AppState;
      const selectedFolderId =
        data.selectedFolderId && data.folders.some((f) => f.id === data.selectedFolderId)
          ? data.selectedFolderId
          : data.folders?.[0]?.id ?? null;
      set({
        folders: data.folders ?? [],
        nodes: data.nodes ?? [],
        edges: data.edges ?? [],
        selectedFolderId,
        version: data.version ?? 1,
        hydrated: true,
        isDirty: false,
        justSaved: false,
        lastSavedAt: Date.now(),
      });
    } catch (err) {
      set({
        error: (err as Error).message,
        hydrated: true,
      });
    }
  },

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  focusNode: (id) => set({ focusedNodeId: id, selectedNodeId: id }),
  clearFocus: () => set({ focusedNodeId: null }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  createFolder: (name, parentId) => {
    const id = nanoid(8);
    const folder: Folder = { id, name, parentId, createdAt: Date.now() };
    set((s) => ({ folders: [...s.folders, folder], selectedFolderId: id }));
    scheduleSave(get, set);
    return id;
  },

  renameFolder: (id, name) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
    scheduleSave(get, set);
  },

  deleteFolder: (id) => {
    set((s) => {
      const toDelete = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        toDelete.add(cur);
        s.folders.filter((f) => f.parentId === cur).forEach((f) => queue.push(f.id));
      }
      const remainingFolders = s.folders.filter((f) => !toDelete.has(f.id));
      const remainingNodes = s.nodes.filter((n) => !toDelete.has(n.folderId));
      const remainingEdges = s.edges.filter((e) => !toDelete.has(e.folderId));
      return {
        folders: remainingFolders,
        nodes: remainingNodes,
        edges: remainingEdges,
        selectedFolderId:
          s.selectedFolderId && toDelete.has(s.selectedFolderId)
            ? remainingFolders[0]?.id ?? null
            : s.selectedFolderId,
        focusedNodeId:
          s.focusedNodeId &&
          remainingNodes.some((n) => n.id === s.focusedNodeId)
            ? s.focusedNodeId
            : null,
        selectedNodeId:
          s.selectedNodeId &&
          remainingNodes.some((n) => n.id === s.selectedNodeId)
            ? s.selectedNodeId
            : null,
      };
    });
    scheduleSave(get, set);
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id });
    scheduleSave(get, set);
  },

  addNode: (folderId, data, position) => {
    const id = nanoid(10);
    const node: CanvasNode = {
      id,
      folderId,
      position,
      data,
      width:
        data.kind === "blog"
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
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      focusedNodeId: s.focusedNodeId === id ? null : s.focusedNodeId,
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
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

  addEdge: (folderId, source, target) => {
    if (source === target) return;
    const exists = get().edges.some(
      (e) =>
        e.folderId === folderId && e.source === source && e.target === target
    );
    if (exists) return;
    const edge: CanvasEdge = {
      id: nanoid(8),
      folderId,
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

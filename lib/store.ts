"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  AiAnswerNodeData,
  AiMessage,
  AiSourceRef,
  AiTurn,
  AnyNodeData,
  AppState,
  CanvasEdge,
  CanvasNode,
  Comment,
  FloatingPanel,
  LinkNodeData,
  PanelSnap,
  PdfHighlight,
  PdfHighlightRect,
  StudyBuddyState,
  StudyStreak,
  WebHighlight,
  Workspace,
} from "./types";
import { localDayString } from "./study";
import type { SnapLayoutId } from "./snap-layouts";
import {
  DEFAULT_WORKSPACE_ID,
  INITIAL_STATE,
  INITIAL_STUDY_BUDDY,
  NODE_WIDTHS,
  STUDY_BUDDY_MAX_WIDTH,
  STUDY_BUDDY_MIN_WIDTH,
} from "./defaults";
import { migrateNode } from "./migrations";
import { useToastStore } from "@/components/ui/Toast";

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
  // Set when the *initial* load failed — the canvas must not render (and
  // especially must not accept edits) on top of the default state, or a
  // later save would overwrite the user's real data with it.
  hydrateFailed: boolean;
  error: string | null;
  isDirty: boolean;
  justSaved: boolean;
  lastSavedAt: number | null;
  panels: FloatingPanel[];
  focusedNodeId: string | null;
  selectedNodeId: string | null;
  sidebarCollapsed: boolean;
  // Pending PDF highlight jumps keyed by node id. A panel-body effect picks
  // them up once the PDF is loaded, scrolls to the highlight, and clears it
  // via consumePendingHighlightJump.
  pendingHighlightJumps: Record<string, string>;

  // `preserveSelection` keeps the locally selected workspace (when it
  // still exists) across a background re-load — used by cross-tab sync
  // and 409-conflict recovery so the refresh doesn't yank the user to
  // whatever workspace the *other* tab had selected.
  hydrate: (opts?: { preserveSelection?: boolean }) => Promise<void>;
  // Immediate manual flush for the "save failed" pill.
  retrySave: () => void;
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
  snapPanel: (panelId: string, layout: SnapLayoutId, slot: number) => void;
  unsnapPanel: (panelId: string) => void;

  createWorkspace: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  selectWorkspace: (id: string) => void;
  // Reorder within the sidebar list (array order is display order).
  moveWorkspace: (id: string, dir: -1 | 1) => void;

  addNode: (
    workspaceId: string,
    data: AnyNodeData,
    position: { x: number; y: number }
  ) => string;
  // Render-order controls. React Flow paints nodes in array order (within
  // the same zIndex tier), so overlapping shapes/frames need a way to
  // reorder — e.g. a small frame placed on top of a big backdrop frame.
  bringNodeToFront: (id: string) => void;
  sendNodeToBack: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, patch: Partial<AnyNodeData>) => void;
  deleteNode: (id: string) => void;
  deleteNodeWithSnapshot: (id: string) => DeletedNodeSnapshot | null;
  restoreDeletedNode: (snapshot: DeletedNodeSnapshot) => void;

  addEdge: (workspaceId: string, source: string, target: string) => void;
  deleteEdge: (id: string) => void;

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

  // AI conversation node helpers — focused on the chat-turn ergonomics
  // the AiAnswerPanelBody needs (append, patch by id, remove by id) so
  // the panel doesn't have to splice arrays itself.
  appendAiTurn: (nodeId: string, turn: AiTurn) => void;
  updateAiTurn: (
    nodeId: string,
    turnId: string,
    patch: Partial<AiTurn>
  ) => void;
  removeAiTurn: (nodeId: string, turnId: string) => void;

  // Study Buddy — app-wide persistent assistant docked on the right.
  // Lives outside any single node so it follows the user across
  // workspaces and reloads. State persists with the AppState snapshot.
  studyBuddy: StudyBuddyState;
  toggleStudyBuddy: () => void;
  setStudyBuddyOpen: (open: boolean) => void;
  setStudyBuddyWidth: (width: number) => void;
  setStudyBuddyHandsFree: (handsFree: boolean) => void;
  appendStudyBuddyTurn: (turn: AiTurn) => void;
  updateStudyBuddyTurn: (turnId: string, patch: Partial<AiTurn>) => void;
  removeStudyBuddyTurn: (turnId: string) => void;
  clearStudyBuddyThread: () => void;
  addStudyBuddyExtraSource: (source: AiSourceRef) => void;
  updateStudyBuddyExtraSource: (
    sid: string,
    patch: Partial<AiSourceRef>
  ) => void;
  removeStudyBuddyExtraSource: (sid: string) => void;
  restampStudyBuddyExtraSources: () => AiSourceRef[];

  // Daily review streak — called once per day on the first completed
  // review (any surface: deck panel or the Today overlay).
  recordStudyDay: () => void;

  addWebHighlight: (
    nodeId: string,
    text: string,
    prefix: string,
    suffix: string,
    color: string
  ) => string | null;
  deleteWebHighlight: (nodeId: string, highlightId: string) => void;
  addWebComment: (
    nodeId: string,
    highlightId: string,
    text: string
  ) => void;
  deleteWebComment: (
    nodeId: string,
    highlightId: string,
    commentId: string
  ) => void;
  setLinkExtraction: (
    nodeId: string,
    snapshot: {
      finalUrl?: string;
      title?: string | null;
      byline?: string | null;
      siteName?: string | null;
      excerpt?: string | null;
      contentHtml: string;
      fetchedAt?: number;
    }
  ) => void;

  // Generalized highlight-jump action used by citation pills, regardless of
  // whether the source is a PDF or a web article. The PDF-specific name is
  // kept as a thin alias for back-compat with existing callers.
  requestHighlightJump: (nodeId: string, highlightId: string) => void;
  requestPdfHighlightJump: (nodeId: string, highlightId: string) => void;
  consumePendingHighlightJump: (nodeId: string) => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let justSavedTimer: ReturnType<typeof setTimeout> | null = null;

// Single-writer save pipeline. Only one PUT is ever in flight; saves
// requested while one is running coalesce into a single trailing save
// that re-reads fresh state (and a fresh version) once the first
// completes. Without this, an edit made during an in-flight save would
// reuse the same version number and trip the server's conflict guard
// against our own write.
let saveInFlight = false;
let saveQueued = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAY_INITIAL_MS = 4_000;
const RETRY_DELAY_MAX_MS = 32_000;
let retryDelayMs = RETRY_DELAY_INITIAL_MS;

const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 280;
const PANEL_MARGIN = 16;
const ADDITIVE_OFFSET = 32;

function viewportSize(): { vw: number; vh: number } {
  if (typeof window === "undefined") return { vw: 1280, vh: 800 };
  return { vw: window.innerWidth, vh: window.innerHeight };
}

function clampBuddyWidth(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : INITIAL_STUDY_BUDDY.width;
  return Math.max(STUDY_BUDDY_MIN_WIDTH, Math.min(STUDY_BUDDY_MAX_WIDTH, Math.round(n)));
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

type SaveOutcome = "ok" | "conflict" | "error";

async function persistToServer(body: string): Promise<SaveOutcome> {
  try {
    // NOTE: do NOT set `keepalive: true` here. Chromium enforces a hard
    // 64 KiB cumulative body cap on keepalive requests across the page
    // lifetime; once a workspace accumulates highlights / extracted HTML
    // the snapshot blows through that and fetch synchronously rejects
    // with `TypeError: Failed to fetch`, killing autosave entirely. The
    // unload-time flush is handled separately via navigator.sendBeacon
    // below, which is the right primitive for "finish even if the page
    // is gone" anyway.
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.status === 409) return "conflict";
    if (!res.ok) {
      console.error(
        "Failed to save state (server returned)",
        res.status,
        res.statusText
      );
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("Failed to save state", err);
    return "error";
  }
}

// Cross-tab signal: posted after every successful save so sibling tabs
// can pull the new snapshot instead of discovering it later via a 409.
const STATE_CHANNEL_NAME = "studygit-state";
let stateChannel: BroadcastChannel | null = null;

function getStateChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!stateChannel) stateChannel = new BroadcastChannel(STATE_CHANNEL_NAME);
  return stateChannel;
}

let crossTabSyncInstalled = false;
function installCrossTabSync(get: () => Store): void {
  if (crossTabSyncInstalled) return;
  const channel = getStateChannel();
  if (!channel) return;
  crossTabSyncInstalled = true;
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; version?: number } | null;
    if (!data || data.type !== "saved" || typeof data.version !== "number") {
      return;
    }
    const s = get();
    if (data.version <= s.version) return;
    // A dirty tab keeps its local edits; its next save will 409 and go
    // through the conflict path instead. Only clean tabs silently follow.
    if (s.isDirty || saveInFlight) return;
    void s.hydrate({ preserveSelection: true });
  };
}

// Best-effort flush at page-close time. Uses `navigator.sendBeacon` which
// the browser is guaranteed to dispatch even after the document is gone —
// this is the correct primitive for "finish saving on Cmd+W / quit" and
// avoids the 64 KiB keepalive cap that the regular fetch path can't carry
// for non-trivial workspaces.
function flushOnUnload(get: () => Store): void {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const s = get();
  if (!s.isDirty) return;
  try {
    const snapshot: AppState = {
      workspaces: s.workspaces,
      nodes: s.nodes,
      edges: s.edges,
      selectedWorkspaceId: s.selectedWorkspaceId,
      version: s.version + 1,
      studyBuddy: s.studyBuddy,
      studyStreak: s.studyStreak,
    };
    const blob = new Blob([JSON.stringify(snapshot)], {
      type: "application/json",
    });
    // sendBeacon is POST-only; the /api/state route accepts POST as an
    // alias for the unload path (see app/api/state/route.ts).
    navigator.sendBeacon("/api/state", blob);
  } catch (err) {
    console.warn("[store] unload flush failed", err);
  }
}

let unloadHandlerInstalled = false;
function installUnloadFlush(get: () => Store): void {
  if (unloadHandlerInstalled) return;
  if (typeof window === "undefined") return;
  unloadHandlerInstalled = true;
  // `pagehide` is the spec-blessed event for "this document is going
  // away"; it fires for both bfcache evictions and real unloads and is
  // strictly more reliable than `beforeunload` (which Chromium skips for
  // background tabs and some PWA close paths).
  window.addEventListener("pagehide", () => flushOnUnload(get));
}

// Yield the heavy work (`JSON.stringify` on potentially MBs of state) to
// the browser's idle phase so user input doesn't stall. Falls back to a
// 0-ms setTimeout where `requestIdleCallback` isn't available (Safari).
function runWhenIdle(fn: () => void, timeoutMs = 1500): void {
  type RIC = (
    cb: () => void,
    opts?: { timeout?: number }
  ) => unknown;
  const ric: RIC | undefined =
    typeof window !== "undefined"
      ? (window as unknown as { requestIdleCallback?: RIC }).requestIdleCallback
      : undefined;
  if (ric) {
    ric(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 0);
  }
}

function performSave(
  get: () => Store,
  set: (patch: Partial<Store>) => void
): void {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  saveInFlight = true;
  runWhenIdle(async () => {
    const s = get();
    const snapshot: AppState = {
      workspaces: s.workspaces,
      nodes: s.nodes,
      edges: s.edges,
      selectedWorkspaceId: s.selectedWorkspaceId,
      version: s.version + 1,
      studyBuddy: s.studyBuddy,
      studyStreak: s.studyStreak,
    };
    // Stringify + send inside the idle callback so the main thread
    // stays responsive during typing bursts.
    const body = JSON.stringify(snapshot);
    const outcome = await persistToServer(body);
    saveInFlight = false;

    if (outcome === "conflict") {
      // Another tab/device committed a newer snapshot. Pull it and tell
      // the user — at most the last debounce window of local edits is
      // discarded, versus silently erasing the other tab's work.
      saveQueued = false;
      retryDelayMs = RETRY_DELAY_INITIAL_MS;
      useToastStore
        .getState()
        .push(
          { message: "Updated in another tab — loaded the latest version" },
          6000
        );
      await get().hydrate({ preserveSelection: true });
      return;
    }

    if (outcome === "error") {
      // Keep isDirty true (the data is still unsaved) and retry on a
      // backoff. The header pill surfaces this state with a manual
      // retry affordance.
      set({
        error: "Couldn't save your changes — retrying automatically.",
      });
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        performSave(get, set);
      }, retryDelayMs);
      retryDelayMs = Math.min(RETRY_DELAY_MAX_MS, retryDelayMs * 2);
      return;
    }

    retryDelayMs = RETRY_DELAY_INITIAL_MS;
    getStateChannel()?.postMessage({ type: "saved", version: snapshot.version });

    if (saveQueued) {
      // Edits landed while this save was in flight — chain a trailing
      // save that reads fresh state and the freshly bumped version.
      saveQueued = false;
      set({ error: null, version: snapshot.version, lastSavedAt: Date.now() });
      performSave(get, set);
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
  });
}

function scheduleSave(get: () => Store, set: (patch: Partial<Store>) => void) {
  set({ isDirty: true });
  // Fresh user activity resets the failure backoff — the manual signal
  // beats a stale timer.
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelayMs = RETRY_DELAY_INITIAL_MS;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => performSave(get, set), 400);
}

export const useStore = create<Store>((set, get) => ({
  ...INITIAL_STATE,
  hydrated: false,
  hydrateFailed: false,
  error: null,
  isDirty: false,
  justSaved: false,
  lastSavedAt: null,
  panels: [],
  focusedNodeId: null,
  selectedNodeId: null,
  sidebarCollapsed: false,
  pendingHighlightJumps: {},
  studyBuddy: INITIAL_STUDY_BUDDY,

  hydrate: async (opts) => {
    installUnloadFlush(get);
    installCrossTabSync(get);
    const preserveSelection = opts?.preserveSelection === true;
    const prevSelectedWorkspaceId = get().selectedWorkspaceId;
    try {
      const res = await fetch("/api/state");
      if (!res.ok) {
        throw new Error(`Failed to load state (${res.status})`);
      }
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

      let nodesMigrated = false;
      const nodes: CanvasNode[] = incomingNodes.map((n) => {
        const wsId =
          n.workspaceId && validWsIds.has(n.workspaceId)
            ? n.workspaceId
            : (n.folderId && folderToWs.get(n.folderId)) || fallbackWsId;
        const { folderId: _legacy, ...rest } = n;
        void _legacy;
        const base: CanvasNode = { ...rest, workspaceId: wsId };
        const migrated = migrateNode(base);
        if (migrated.changed) nodesMigrated = true;
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

      let selectedWorkspaceId =
        data.selectedWorkspaceId && validWsIds.has(data.selectedWorkspaceId)
          ? data.selectedWorkspaceId
          : (data.selectedFolderId &&
              folderToWs.get(data.selectedFolderId)) ||
            fallbackWsId;
      if (
        preserveSelection &&
        prevSelectedWorkspaceId &&
        validWsIds.has(prevSelectedWorkspaceId)
      ) {
        selectedWorkspaceId = prevSelectedWorkspaceId;
      }

      // Hydrate the Study Buddy slot defensively — older snapshots
      // predate this field, and we want to gracefully ignore any
      // malformed data that wandered into the persisted blob without
      // dropping the rest of the workspace.
      const incomingBuddy = (data as { studyBuddy?: unknown }).studyBuddy;
      const studyBuddy: StudyBuddyState =
        incomingBuddy && typeof incomingBuddy === "object"
          ? {
              open:
                typeof (incomingBuddy as StudyBuddyState).open === "boolean"
                  ? (incomingBuddy as StudyBuddyState).open
                  : INITIAL_STUDY_BUDDY.open,
              width: clampBuddyWidth(
                (incomingBuddy as StudyBuddyState).width ??
                  INITIAL_STUDY_BUDDY.width
              ),
              turns: Array.isArray((incomingBuddy as StudyBuddyState).turns)
                ? // Demote turns persisted as "running" (reload/crash mid-
                  // request) to retryable errors — a stuck running turn
                  // permanently blocks the buddy composer otherwise.
                  (incomingBuddy as StudyBuddyState).turns.map((t) =>
                    t.status === "running"
                      ? {
                          ...t,
                          status: "error" as const,
                          error:
                            "Interrupted — the app reloaded while this reply was generating. Retry to re-ask.",
                        }
                      : t
                  )
                : [],
              extraSources: Array.isArray(
                (incomingBuddy as StudyBuddyState).extraSources
              )
                ? (incomingBuddy as StudyBuddyState).extraSources
                : [],
              handsFree:
                typeof (incomingBuddy as StudyBuddyState).handsFree === "boolean"
                  ? (incomingBuddy as StudyBuddyState).handsFree
                  : INITIAL_STUDY_BUDDY.handsFree,
            }
          : INITIAL_STUDY_BUDDY;

      // Streak slot is optional + validated — malformed data degrades to
      // "no streak" instead of breaking hydration.
      const incomingStreak = (data as { studyStreak?: unknown }).studyStreak;
      const studyStreak: StudyStreak | undefined =
        incomingStreak &&
        typeof incomingStreak === "object" &&
        typeof (incomingStreak as StudyStreak).count === "number" &&
        typeof (incomingStreak as StudyStreak).lastDay === "string"
          ? {
              count: Math.max(0, Math.floor((incomingStreak as StudyStreak).count)),
              lastDay: (incomingStreak as StudyStreak).lastDay,
            }
          : undefined;

      set({
        workspaces,
        nodes,
        edges,
        selectedWorkspaceId,
        version: data.version ?? 1,
        hydrated: true,
        hydrateFailed: false,
        error: null,
        isDirty: false,
        justSaved: false,
        lastSavedAt: Date.now(),
        studyBuddy,
        studyStreak,
      });

      const needsMigration =
        hadFolders ||
        !data.workspaces ||
        nodesMigrated ||
        incomingNodes.some((n) => !n.workspaceId) ||
        incomingEdges.some((e) => !e.workspaceId);
      if (needsMigration) scheduleSave(get, set);
    } catch (err) {
      // Background refreshes (cross-tab sync / conflict recovery) fail
      // soft: keep the working in-memory state, log, move on. Only the
      // initial load surfaces the failure screen.
      if (preserveSelection && get().hydrated) {
        console.warn("[store] background state refresh failed", err);
        return;
      }
      set({
        error: (err as Error).message,
        hydrated: true,
        hydrateFailed: true,
      });
    }
  },

  retrySave: () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryDelayMs = RETRY_DELAY_INITIAL_MS;
    performSave(get, set);
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
        p.id === panelId
          ? { ...p, x, y, maximized: false, snap: undefined }
          : p
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
              snap: undefined,
            }
          : p
      ),
    }));
  },

  togglePanelMaximize: (panelId) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId
          ? { ...p, maximized: !p.maximized, snap: undefined }
          : p
      ),
    }));
  },

  snapPanel: (panelId, layout, slot) => {
    set((s) => {
      const target = s.panels.find((p) => p.id === panelId);
      if (!target) return s;
      const nextSnap: PanelSnap = { layout, slot };
      const top = maxZ(s.panels);
      // If another panel is already in this exact slot, evict it back to a
      // free state — mirrors Windows' behavior where placing a new window in
      // a snap zone pushes out the previous occupant.
      const panels = s.panels.map((p) => {
        if (p.id === panelId) {
          return {
            ...p,
            snap: nextSnap,
            maximized: false,
            // Bring the freshly snapped panel to the top of the stack so
            // it can immediately receive focus / keyboard input.
            z: p.z === top ? p.z : top + 1,
          };
        }
        if (
          p.snap &&
          p.snap.layout === layout &&
          p.snap.slot === slot
        ) {
          return { ...p, snap: undefined };
        }
        return p;
      });
      return {
        panels,
        focusedNodeId: focusedNodeIdFromPanels(panels),
      };
    });
  },

  unsnapPanel: (panelId) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId ? { ...p, snap: undefined } : p
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

  moveWorkspace: (id, dir) => {
    set((s) => {
      const idx = s.workspaces.findIndex((w) => w.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= s.workspaces.length) return s;
      const next = [...s.workspaces];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { workspaces: next };
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
      width: NODE_WIDTHS[data.kind] ?? 240,
      height: data.kind === "shape" ? 220 : undefined,
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
    scheduleSave(get, set);
    return id;
  },

  bringNodeToFront: (id) => {
    set((s) => {
      const idx = s.nodes.findIndex((n) => n.id === id);
      if (idx === -1 || idx === s.nodes.length - 1) return s;
      const next = [...s.nodes];
      const [node] = next.splice(idx, 1);
      next.push(node);
      return { nodes: next };
    });
    scheduleSave(get, set);
  },

  sendNodeToBack: (id) => {
    set((s) => {
      const idx = s.nodes.findIndex((n) => n.id === id);
      if (idx <= 0) return s;
      const next = [...s.nodes];
      const [node] = next.splice(idx, 1);
      next.unshift(node);
      return { nodes: next };
    });
    scheduleSave(get, set);
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

  appendAiTurn: (nodeId, turn) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "ai") return n;
        const data = n.data as AiAnswerNodeData;
        return {
          ...n,
          data: { ...data, turns: [...data.turns, turn] },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  updateAiTurn: (nodeId, turnId, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "ai") return n;
        const data = n.data as AiAnswerNodeData;
        return {
          ...n,
          data: {
            ...data,
            turns: data.turns.map((t) =>
              t.id === turnId ? { ...t, ...patch } : t
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  removeAiTurn: (nodeId, turnId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "ai") return n;
        const data = n.data as AiAnswerNodeData;
        return {
          ...n,
          data: { ...data, turns: data.turns.filter((t) => t.id !== turnId) },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  // ----- Study Buddy ------------------------------------------------
  // Open/close is treated as workspace state (persisted) so the dock
  // remembers whether the user wanted it open. Width follows the same
  // rule. Thread + extra sources are persisted so the buddy genuinely
  // is "continuous" across reloads.
  toggleStudyBuddy: () => {
    set((s) => ({ studyBuddy: { ...s.studyBuddy, open: !s.studyBuddy.open } }));
    scheduleSave(get, set);
  },

  setStudyBuddyOpen: (open) => {
    set((s) => ({ studyBuddy: { ...s.studyBuddy, open } }));
    scheduleSave(get, set);
  },

  setStudyBuddyWidth: (width) => {
    set((s) => ({
      studyBuddy: { ...s.studyBuddy, width: clampBuddyWidth(width) },
    }));
    scheduleSave(get, set);
  },

  setStudyBuddyHandsFree: (handsFree) => {
    set((s) => ({ studyBuddy: { ...s.studyBuddy, handsFree } }));
    scheduleSave(get, set);
  },

  appendStudyBuddyTurn: (turn) => {
    set((s) => ({
      studyBuddy: { ...s.studyBuddy, turns: [...s.studyBuddy.turns, turn] },
    }));
    scheduleSave(get, set);
  },

  updateStudyBuddyTurn: (turnId, patch) => {
    set((s) => ({
      studyBuddy: {
        ...s.studyBuddy,
        turns: s.studyBuddy.turns.map((t) =>
          t.id === turnId ? { ...t, ...patch } : t
        ),
      },
    }));
    scheduleSave(get, set);
  },

  removeStudyBuddyTurn: (turnId) => {
    set((s) => ({
      studyBuddy: {
        ...s.studyBuddy,
        turns: s.studyBuddy.turns.filter((t) => t.id !== turnId),
      },
    }));
    scheduleSave(get, set);
  },

  clearStudyBuddyThread: () => {
    set((s) => ({
      studyBuddy: { ...s.studyBuddy, turns: [], extraSources: [] },
    }));
    scheduleSave(get, set);
  },

  addStudyBuddyExtraSource: (source) => {
    set((s) => {
      // Dedupe: don't attach the same node+highlight twice.
      const key = `${source.nodeId}:${source.highlightId ?? source.nodeId}`;
      const exists = s.studyBuddy.extraSources.some(
        (e) => `${e.nodeId}:${e.highlightId ?? e.nodeId}` === key
      );
      if (exists) return s;
      return {
        studyBuddy: {
          ...s.studyBuddy,
          extraSources: [...s.studyBuddy.extraSources, source],
        },
      };
    });
    scheduleSave(get, set);
  },

  updateStudyBuddyExtraSource: (sid, patch) => {
    set((s) => ({
      studyBuddy: {
        ...s.studyBuddy,
        extraSources: s.studyBuddy.extraSources.map((src) =>
          src.sid === sid ? { ...src, ...patch } : src
        ),
      },
    }));
    scheduleSave(get, set);
  },

  removeStudyBuddyExtraSource: (sid) => {
    set((s) => ({
      studyBuddy: {
        ...s.studyBuddy,
        extraSources: s.studyBuddy.extraSources.filter((src) => src.sid !== sid),
      },
    }));
    scheduleSave(get, set);
  },

  recordStudyDay: () => {
    const today = localDayString();
    const prev = get().studyStreak;
    if (prev?.lastDay === today) return; // already counted today
    const yesterday = localDayString(-1);
    const count = prev?.lastDay === yesterday ? prev.count + 1 : 1;
    set({ studyStreak: { count, lastDay: today } });
    scheduleSave(get, set);
  },

  // Re-stamp extra source sids to e1..eN at send time so the model
  // gets a clean, stable numbering each turn. Sids on the auto-attached
  // current node (s1) are stamped by the panel itself — see
  // StudyBuddyPanel's send() — so they don't collide with these.
  restampStudyBuddyExtraSources: () => {
    const current = get().studyBuddy.extraSources;
    const restamped = current.map((s, i) => ({ ...s, sid: `e${i + 1}` }));
    const changed = restamped.some((s, i) => s.sid !== current[i].sid);
    if (changed) {
      set((s) => ({
        studyBuddy: { ...s.studyBuddy, extraSources: restamped },
      }));
    }
    return restamped;
  },

  addWebHighlight: (nodeId, text, prefix, suffix, color) => {
    const target = get().nodes.find((n) => n.id === nodeId);
    if (!target || target.data.kind !== "link") return null;
    const id = nanoid(8);
    const highlight: WebHighlight = {
      id,
      text,
      prefix,
      suffix,
      color,
      comments: [],
      aiThread: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "link") return n;
        const data = n.data as LinkNodeData;
        return {
          ...n,
          data: {
            ...data,
            highlights: [...(data.highlights ?? []), highlight],
          },
        };
      }),
    }));
    scheduleSave(get, set);
    return id;
  },

  deleteWebHighlight: (nodeId, highlightId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "link") return n;
        const data = n.data as LinkNodeData;
        return {
          ...n,
          data: {
            ...data,
            highlights: (data.highlights ?? []).filter(
              (h) => h.id !== highlightId
            ),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  addWebComment: (nodeId, highlightId, text) => {
    const comment: Comment = {
      id: nanoid(8),
      text,
      createdAt: Date.now(),
    };
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "link") return n;
        const data = n.data as LinkNodeData;
        return {
          ...n,
          data: {
            ...data,
            highlights: (data.highlights ?? []).map((h) =>
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

  deleteWebComment: (nodeId, highlightId, commentId) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "link") return n;
        const data = n.data as LinkNodeData;
        return {
          ...n,
          data: {
            ...data,
            highlights: (data.highlights ?? []).map((h) =>
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

  setLinkExtraction: (nodeId, snapshot) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.kind !== "link") return n;
        const data = n.data as LinkNodeData;
        return {
          ...n,
          data: {
            ...data,
            extractedHtml: snapshot.contentHtml,
            extractedTitle: snapshot.title ?? data.extractedTitle,
            extractedByline: snapshot.byline ?? data.extractedByline,
            extractedSiteName: snapshot.siteName ?? data.extractedSiteName,
            extractedExcerpt: snapshot.excerpt ?? data.extractedExcerpt,
            extractedFinalUrl: snapshot.finalUrl ?? data.extractedFinalUrl,
            extractedAt: snapshot.fetchedAt ?? Date.now(),
          },
        };
      }),
    }));
    scheduleSave(get, set);
  },

  requestHighlightJump: (nodeId, highlightId) => {
    const state = get();
    const target = state.nodes.find((n) => n.id === nodeId);
    if (!target) return;
    // If the citation points to a node in another workspace, switch first so
    // the panel becomes visible. selectWorkspace clears panels, so we open
    // afterwards.
    if (target.workspaceId !== state.selectedWorkspaceId) {
      get().selectWorkspace(target.workspaceId);
    }
    get().openPanel(nodeId);
    set((s) => ({
      pendingHighlightJumps: {
        ...s.pendingHighlightJumps,
        [nodeId]: highlightId,
      },
    }));
  },

  requestPdfHighlightJump: (nodeId, highlightId) => {
    get().requestHighlightJump(nodeId, highlightId);
  },

  consumePendingHighlightJump: (nodeId) => {
    set((s) => {
      if (!(nodeId in s.pendingHighlightJumps)) return s;
      const next = { ...s.pendingHighlightJumps };
      delete next[nodeId];
      return { pendingHighlightJumps: next };
    });
  },
}));

"use client";

import { create } from "zustand";
import { X } from "lucide-react";

type ToastItem = {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastStore = {
  items: ToastItem[];
  push: (item: Omit<ToastItem, "id">, durationMs?: number) => string;
  dismiss: (id: string) => void;
  pushUndo: (message: string, onUndo: () => void, durationMs?: number) => string;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (item, durationMs = 4000) => {
    const id = crypto.randomUUID();
    set((s) => ({ items: [...s.items, { ...item, id }] }));
    const timer = setTimeout(() => get().dismiss(id), durationMs);
    timers.set(id, timer);
    return id;
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
  pushUndo: (message, onUndo, durationMs = 4000) =>
    get().push({ message, actionLabel: "Undo", onAction: onUndo }, durationMs),
}));

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (items.length === 0) return null;

  return (
    <div className="fixed left-1/2 bottom-4 z-[70] -translate-x-1/2 flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto inline-flex min-w-[280px] items-center justify-between gap-3 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-bg-elevated)] px-3 py-2 shadow-[var(--pg-shadow)]"
        >
          <div className="text-[12px] text-zinc-200">{item.message}</div>
          <div className="flex items-center gap-2">
            {item.actionLabel && item.onAction && (
              <button
                className="rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--pg-accent)] hover:bg-zinc-800"
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                {item.actionLabel}
              </button>
            )}
            <button
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
              onClick={() => dismiss(item.id)}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

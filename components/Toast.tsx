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
          className="pointer-events-auto inline-flex min-w-[280px] items-center justify-between gap-3 rounded-lg border border-[var(--pg-border)] bg-[var(--pg-bg)] px-3 py-1.5 shadow-[var(--pg-shadow-lg)]"
        >
          <div className="pg-serif text-[12px] italic text-[var(--pg-fg)]">{item.message}</div>
          <div className="flex items-center gap-1">
            {item.actionLabel && item.onAction && (
              <button
                className="rounded px-2 py-0.5 text-[12px] font-medium text-[var(--pg-accent)] hover:bg-[var(--pg-accent-soft)]"
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                {item.actionLabel}
              </button>
            )}
            <button
              className="rounded p-1 text-[var(--pg-muted)] hover:text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)]"
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

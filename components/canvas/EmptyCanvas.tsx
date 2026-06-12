"use client";

// Shown over an empty workspace instead of a blank React Flow void. Offers
// one-click quick-start templates (which seed pre-wired nodes) plus a hint
// for the people who'd rather start from nothing. Non-interactive areas let
// pointer events through so the canvas underneath stays pannable.

import {
  FolderOpen,
  Layers,
  NotebookPen,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { TEMPLATES, type TemplateDef } from "@/lib/templates";

const ICONS: Record<TemplateDef["icon"], LucideIcon> = {
  notebook: NotebookPen,
  layers: Layers,
  folder: FolderOpen,
  sparkles: Sparkles,
};

export function EmptyCanvas({
  onPick,
}: {
  onPick: (template: TemplateDef) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
      <div className="pg-anim-rise pointer-events-auto w-full max-w-2xl text-center">
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg)]/70 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em] text-[var(--pg-muted)] backdrop-blur-sm">
          <Sparkles size={11} />
          New workspace
        </div>
        <h2 className="pg-serif mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--pg-fg)]">
          Start with a template
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--pg-muted)]">
          Each one drops in a few connected nodes you can edit right away — or
          press a key (P, B, F, …) to add your own and dismiss this.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {TEMPLATES.map((template) => {
            const Icon = ICONS[template.icon];
            return (
              <button
                key={template.id}
                onClick={() => onPick(template)}
                className="group flex flex-col items-start gap-2 rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg)] p-3.5 text-left shadow-[var(--pg-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--pg-border-strong)] hover:shadow-[var(--pg-shadow)]"
              >
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--pg-radius-md)] transition-colors"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--pg-accent) 11%, transparent)",
                    color:
                      "color-mix(in srgb, var(--pg-accent) 80%, var(--pg-fg) 20%)",
                  }}
                >
                  <Icon size={16} />
                </span>
                <span className="text-[13px] font-medium text-[var(--pg-fg)]">
                  {template.name}
                </span>
                <span className="text-[11.5px] leading-snug text-[var(--pg-muted)]">
                  {template.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

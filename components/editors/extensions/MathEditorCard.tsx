"use client";

import { useEffect, useMemo, useRef } from "react";
import katex from "katex";
import { Check, Sigma, TriangleAlert, X } from "lucide-react";

export type MathEditorMode = "inline" | "block";

interface Props {
  mode: MathEditorMode;
  draft: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// Shared editor card used by both the inline and the block math node views.
// Keeping a single implementation guarantees the two surfaces stay in sync —
// same keyboard shortcuts, same error UI, same preview pane. The only thing
// that differs is whether KaTeX renders in display or inline mode (and a few
// labels/placeholders) — both driven off the `mode` prop.
export function MathEditorCard({
  mode,
  draft,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // Place the caret at the end so opening an existing formula doesn't
      // start the cursor at column 0 (which would feel "destructive" — the
      // user expects to continue editing where they left off).
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }, []);

  // Live preview re-renders on every keystroke. KaTeX is fast enough
  // (sub-millisecond for typical formulas) that debouncing would just
  // add visible lag. `throwOnError: true` lets us surface syntax errors
  // inline instead of rendering KaTeX's broken red HTML.
  const livePreview = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return { html: "", error: null as string | null };
    }
    try {
      const html = katex.renderToString(trimmed, {
        throwOnError: true,
        displayMode: mode === "block",
        output: "html",
      });
      return { html, error: null };
    } catch (err) {
      const message = (err as Error).message || "Couldn't render LaTeX";
      // KaTeX prefixes errors with "ParseError: KaTeX parse error:" — strip
      // that for a tidier inline message.
      const cleaned = message
        .replace(/^ParseError:\s*/, "")
        .replace(/^KaTeX parse error:\s*/, "");
      return { html: "", error: cleaned };
    }
  }, [draft, mode]);

  // Auto-grow the textarea up to a generous cap so multi-line formulas
  // (matrices, aligned environments) don't get squished into a 2-row box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(96, Math.min(360, el.scrollHeight))}px`;
  }, [draft]);

  const labelText = mode === "block" ? "LaTeX" : "LaTeX (inline)";
  const placeholder =
    mode === "block"
      ? "\\sum_{i=0}^n i = \\frac{n(n+1)}{2}"
      : "e^{i\\pi} + 1 = 0";
  const placeholderHint =
    mode === "block"
      ? "Start typing LaTeX — the rendered output will appear here as you go."
      : "Start typing LaTeX — the inline rendered output will appear here.";

  const hasError = !!livePreview.error;
  const hasDraft = !!draft.trim();

  return (
    <div
      className={`pg-math-card pg-math-card-${mode}`}
      role="dialog"
      aria-label={labelText}
      onMouseDown={(e) => {
        // Prevent ProseMirror from stealing focus / collapsing selection when
        // the user mouses down on the card chrome (header, footer, gutters).
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div className="pg-math-card-header">
        <span className="pg-math-card-label">
          <Sigma size={11} />
          {labelText}
        </span>
        <span className="pg-math-card-hint">
          <kbd>⌘</kbd>
          <kbd>↵</kbd>
          <span> render</span>
          <span className="pg-math-card-hint-sep">·</span>
          <kbd>esc</kbd>
          <span> cancel</span>
        </span>
      </div>
      <div className="pg-math-card-split">
        <div className="pg-math-card-pane pg-math-card-pane-edit">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onCommit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
            placeholder={placeholder}
            className="pg-math-card-input"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div className="pg-math-card-pane pg-math-card-pane-preview">
          <div className="pg-math-card-pane-label">Preview</div>
          {livePreview.html ? (
            <div
              className={`pg-math-card-live pg-math-card-live-${mode}`}
              dangerouslySetInnerHTML={{ __html: livePreview.html }}
            />
          ) : livePreview.error ? (
            <div className="pg-math-card-error-state">
              <TriangleAlert
                size={12}
                className="pg-math-card-error-icon"
              />
              <span className="pg-math-card-error-msg">
                {livePreview.error}
              </span>
            </div>
          ) : (
            <div className="pg-math-card-placeholder">{placeholderHint}</div>
          )}
        </div>
      </div>
      <div className="pg-math-card-footer">
        <button
          type="button"
          onClick={onCancel}
          className="pg-math-card-btn pg-math-card-btn-secondary"
          title="Cancel (esc)"
        >
          <X size={11} />
          Cancel
        </button>
        <button
          type="button"
          onClick={onCommit}
          className="pg-math-card-btn pg-math-card-btn-primary"
          title="Render (⌘↵)"
          // Block commit when there's content but it doesn't parse. An
          // empty draft is still allowed — that lets users clear out an
          // accidental insertion by clicking Done on an empty card.
          disabled={hasError && hasDraft}
        >
          <Check size={11} />
          Done
        </button>
      </div>
    </div>
  );
}

export default MathEditorCard;

"use client";

// Shared TipTap toolbar button. PageEditor uses the same 6×6 hit target
// with a 13px icon as RichTextEditor; before this was extracted, both
// files maintained near-identical copies with a comment explicitly
// saying "kept in sync".

import clsx from "clsx";

export type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ComponentType<{ size?: number }>;
};

export function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  icon: Icon,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-[var(--pg-muted)] transition-colors",
        active
          ? "bg-[var(--pg-accent-soft)]/40 text-[var(--pg-fg)]"
          : "hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <Icon size={13} />
    </button>
  );
}

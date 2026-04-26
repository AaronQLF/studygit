"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

export function EditableTitle({
  value,
  onChange,
  placeholder = "Untitled",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={clsx(
          "nodrag w-full rounded-sm border border-[var(--pg-border-strong)] bg-transparent px-1 py-0.5 outline-none",
          className
        )}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      className={clsx(
        "nodrag cursor-text truncate rounded-sm px-1 py-0.5 hover:bg-[var(--pg-bg-elevated)]",
        className
      )}
      title="Click to rename"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value || <span className="italic text-zinc-500">{placeholder}</span>}
    </div>
  );
}

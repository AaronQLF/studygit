"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

type UserMenuProps = {
  email: string | null;
};

export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-[var(--pg-border)] bg-[var(--pg-bg-elevated)] text-[11px] font-semibold text-[var(--pg-fg)] hover:border-[var(--pg-border-strong)]"
        title={email ?? "Account"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 min-w-[200px] rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] shadow-[var(--pg-shadow)] p-1 z-50"
        >
          <div className="px-2.5 py-2 text-[11px] text-[var(--pg-muted)] flex items-center gap-2">
            <UserIcon size={12} />
            <span className="truncate text-[var(--pg-fg-soft)]">
              {email ?? "Signed in"}
            </span>
          </div>
          <div className="h-px bg-[var(--pg-border)] my-1" />
          <form action={signOut}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] rounded-[var(--pg-radius)]"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

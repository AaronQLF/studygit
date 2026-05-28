"use client";

// Shared Escape + outside-click dismissal for popovers, dialogs, and
// floating menus. Open-coded in five places before this was extracted
// (SourcePicker, ThemeSettingsDialog, TimeTracker, BrowserWindow,
// SnapChooserPopover). Each had slightly different propagation rules,
// so the hook exposes the most-used variants as options.

import { useEffect, type RefObject } from "react";

export type UseDismissOnOutsideOptions = {
  /** Whether the surface is currently open. No listeners attach when false. */
  open: boolean;
  /** Called when the user presses Escape or clicks outside the surface(s). */
  onDismiss: () => void;
  /**
   * The element(s) considered "inside". A click inside any of these is
   * ignored. Pass a list when the surface has a separate anchor (e.g. an
   * anchored popover whose trigger should also be treated as "inside").
   */
  refs: ReadonlyArray<RefObject<HTMLElement | null>>;
  /** Dismiss on Escape. Defaults to true. */
  escape?: boolean;
  /** Dismiss on outside mouse-down. Defaults to true. */
  outsideClick?: boolean;
  /**
   * Listen to the keydown event in the *capture* phase and
   * `stopPropagation` when it matches Escape. Needed for nested popovers
   * inside panels where the panel's own Escape handler would otherwise
   * also fire. Defaults to false.
   */
  capturePhase?: boolean;
};

export function useDismissOnOutside({
  open,
  onDismiss,
  refs,
  escape = true,
  outsideClick = true,
  capturePhase = false,
}: UseDismissOnOutsideOptions) {
  useEffect(() => {
    if (!open) return;

    const isInside = (target: Node | null) => {
      if (!target) return false;
      for (const ref of refs) {
        if (ref.current?.contains(target)) return true;
      }
      return false;
    };

    const onMouseDown = (event: MouseEvent) => {
      if (isInside(event.target as Node | null)) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (capturePhase) {
        event.preventDefault();
        event.stopPropagation();
      }
      onDismiss();
    };

    if (outsideClick) document.addEventListener("mousedown", onMouseDown);
    if (escape) window.addEventListener("keydown", onKey, capturePhase);
    return () => {
      if (outsideClick) document.removeEventListener("mousedown", onMouseDown);
      if (escape) window.removeEventListener("keydown", onKey, capturePhase);
    };
  }, [open, onDismiss, refs, escape, outsideClick, capturePhase]);
}

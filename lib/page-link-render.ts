"use client";

// Resolve the snapshot label inside `<span data-type="page-link">` pills
// to the *live* title of the target page node, so canvas card previews
// (which render stored HTML via `dangerouslySetInnerHTML`) don't get
// stuck at the title the subpage had at insertion time.
//
// Inside an active TipTap editor this is handled by the React node view
// `PageLinkView`, which subscribes to the store directly. Previews
// don't mount the editor; they're plain HTML strings, so we DOM-parse
// once per render, swap labels, and serialise back out.

export function resolvePageLinkLabels(
  html: string,
  titlesById: Record<string, string>
): string {
  if (!html) return html;
  if (typeof window === "undefined") return html;
  // Cheap pre-filter: avoid the DOMParser cost when there's no pill in
  // the snippet at all (the common case for short pages).
  if (!html.includes('data-type="page-link"')) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  const pills = doc.querySelectorAll('span[data-type="page-link"]');
  pills.forEach((el) => {
    const pageId = el.getAttribute("data-page-id");
    if (!pageId) return;
    const live = titlesById[pageId];
    const labelEl = el.querySelector(".pg-page-link-label");

    if (live === undefined) {
      // Target page was deleted — visually flag as broken and surface
      // a clearer label than the cached title.
      if (!el.classList.contains("is-broken")) {
        el.classList.add("is-broken");
        changed = true;
      }
      if (labelEl && labelEl.textContent !== "Missing page") {
        labelEl.textContent = "Missing page";
        changed = true;
      }
      return;
    }

    // Target exists — strip any stale broken state and sync the label
    // text + the `data-label` attribute (used as the fallback when the
    // pill is re-parsed back into the editor).
    if (el.classList.contains("is-broken")) {
      el.classList.remove("is-broken");
      changed = true;
    }
    const displayed = live || "Untitled page";
    if (labelEl && labelEl.textContent !== displayed) {
      labelEl.textContent = displayed;
      changed = true;
    }
    if (el.getAttribute("data-label") !== displayed) {
      el.setAttribute("data-label", displayed);
      changed = true;
    }
  });

  if (!changed) return html;
  return doc.body.innerHTML;
}

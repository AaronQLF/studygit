// URL normalization + hostname helpers shared across LinkNode, LinkPanelBody,
// BrowserWindow, Citation pill rendering, and source-row builders. Kept in
// one place so all of them treat "google.com", "https://google.com" and
// "google.com / search" the same way.

/** Add a default `https://` scheme to a bare URL. Returns "" for empty input. */
export function normalizeUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/**
 * Coerce a free-form address-bar entry into a navigable URL. Bare hostnames
 * are promoted to `https://`; anything that doesn't look like a URL falls
 * back to a Google search query.
 */
export function normalizeNavInput(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!/\s/.test(value) && /\./.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

/** Hostname without leading `www.`, or "" when the URL can't be parsed. */
export function hostnameOf(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

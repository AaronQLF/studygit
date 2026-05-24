/** Build the same-origin proxy URL used by the cloud in-app browser. */
export function buildWebProxyUrl(targetUrl: string): string {
  return `/api/web/proxy?url=${encodeURIComponent(targetUrl)}`;
}

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export const WEB_FETCH_TIMEOUT_MS = 10_000;
export const WEB_FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const WEB_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 Studygit-Reader/1.0";

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const norm = addr.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
  if (norm.startsWith("fe80")) return true;
  if (norm.startsWith("ff")) return true;
  const v4 = norm.match(/::ffff:([\d.]+)$/);
  if (v4 && isPrivateIpv4(v4[1])) return true;
  return false;
}

function isPrivateHost(host: string): boolean {
  const family = isIP(host);
  if (family === 4) return isPrivateIpv4(host);
  if (family === 6) return isPrivateIpv6(host);
  return false;
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    throw new Error("hostname is not publicly routable");
  }
  if (isPrivateHost(lower)) {
    throw new Error("hostname is not publicly routable");
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("hostname did not resolve");
  }
  for (const r of records) {
    if (isPrivateHost(r.address)) {
      throw new Error("hostname resolves to a private address");
    }
  }
}

export function validateWebUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("only http(s) URLs are supported");
  }
  if (!parsed.hostname) {
    throw new Error("URL has no hostname");
  }
  return parsed;
}

export async function fetchWebHtml(
  target: URL
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": WEB_FETCH_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      throw new Error(`upstream returned ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`unsupported content-type: ${contentType || "unknown"}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("response body unreadable");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > WEB_FETCH_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error("response too large");
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const charset =
      /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase() ??
      "utf-8";
    const decoder = new TextDecoder(charset.replace(/^"|"$/g, ""), {
      fatal: false,
    });
    return { html: decoder.decode(buf), finalUrl: res.url || target.toString() };
  } finally {
    clearTimeout(timer);
  }
}

export async function assertPublicFinalUrl(finalUrl: string): Promise<void> {
  const finalParsed = new URL(finalUrl);
  await assertPublicHostname(finalParsed.hostname);
}

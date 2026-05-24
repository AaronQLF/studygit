import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import {
  assertPublicFinalUrl,
  assertPublicHostname,
  fetchWebHtml,
  validateWebUrl,
} from "@/lib/server/web-fetch";
import { getPersistenceMode } from "@/lib/persistence";

export const runtime = "nodejs";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function prepareProxiedHtml(html: string, finalUrl: string): string {
  let out = html;
  // Upstream CSP / frame-busting meta tags don't apply to our rewritten
  // response, but strip them anyway so the injected bridge can run.
  out = out.replace(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    ""
  );
  out = out.replace(
    /<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi,
    ""
  );

  const baseTag = `<base href="${escapeHtmlAttr(finalUrl)}">`;
  const bridgeTag =
    '<script src="/web-browser-bridge.js" defer></script>';
  const metaTag =
    `<meta name="pg-proxy-final-url" content="${escapeHtmlAttr(finalUrl)}">`;

  if (/<head\b/i.test(out)) {
    out = out.replace(/<head\b([^>]*)>/i, `<head$1>${baseTag}${metaTag}`);
  } else if (/<html\b/i.test(out)) {
    out = out.replace(/<html\b([^>]*)>/i, `<html$1><head>${baseTag}${metaTag}</head>`);
  } else {
    out = `<head>${baseTag}${metaTag}</head>${out}`;
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${bridgeTag}</body>`);
  } else {
    out += bridgeTag;
  }

  return out;
}

export async function GET(request: Request) {
  if (getPersistenceMode() === "supabase") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = validateWebUrl(raw.trim());
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  try {
    await assertPublicHostname(target.hostname);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  let html: string;
  let finalUrl: string;
  try {
    ({ html, finalUrl } = await fetchWebHtml(target));
  } catch (err) {
    const message =
      (err as Error).name === "AbortError"
        ? "upstream timed out"
        : (err as Error).message || "fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    await assertPublicFinalUrl(finalUrl);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  const body = prepareProxiedHtml(html, finalUrl);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Studygit-Proxy-Final-Url": finalUrl,
    },
  });
}

import { NextResponse } from "next/server";
import {
  AI_HEADER_API_KEY,
  AI_HEADER_BASE_URL,
  AI_HEADER_MODEL,
} from "@/lib/ai-headers";
import {
  processCitations,
  type CitationVerifyMode,
} from "@/lib/ai-citations";
import {
  buildProviderMessages,
  cleanMessages,
  computePromptHashHex,
  hostnameOrEmpty,
  renderSourcesBlock,
  sanitizeSources,
  SYSTEM_PROMPT_RULES,
  type AiAnswerPayload,
  type AiProvenance,
  type AiRequestBody,
  type ProviderResponse,
} from "@/lib/ai-request";

export const runtime = "nodejs";

// Wire format used by the AI conversation panel. The server never
// persists the API key — it's read off the request headers, used once to
// hit the configured OpenAI-compatible endpoint, and discarded.
//
// `messages` carries the conversation so far. The newest entry must be a
// user turn — that's the one we expect the model to respond to. Prior
// assistant turns may contain `<citation>` pills (HTML) emitted by an
// earlier response; the server strips those before re-feeding so the
// model sees clean prose with no leaked pill markup.
//
// `attachments` (per message) carries images the user pasted/dropped
// into the composer as inline data URLs. They're forwarded verbatim to
// the provider using OpenAI's vision content-array format. Providers
// without vision support will typically 400/422 on the call.
//
// Two modes:
//   - "full" (default): the route does everything — auth, provider
//     call, citation processing. Used by the web client.
//   - "process-only": the renderer already made the provider call (via
//     Electron IPC; see electron/main.ts `studygit:ai-fetch`) and just
//     needs the markdown-to-HTML + [sN] pill pipeline run on the raw
//     answer. Used by the packaged Electron app to bypass the hosted
//     function entirely, which is required when the configured AI base
//     URL is only reachable from the user's network (corp VPN, LAN
//     model server, private gateway, etc).

function readVerifyMode(): CitationVerifyMode {
  const raw = (process.env.STUDYGIT_AI_CITATION_VERIFY ?? "strict")
    .trim()
    .toLowerCase();
  if (raw === "lenient" || raw === "off" || raw === "strict") return raw;
  return "strict";
}

export async function POST(request: Request) {
  let body: AiRequestBody;
  try {
    body = (await request.json()) as AiRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // -------------------- process-only --------------------
  // No provider call. Just run citation processing over a raw answer
  // produced by the Electron renderer's IPC fetch.
  if (body.mode === "process-only") {
    if (typeof body.raw !== "string" || body.raw.trim().length === 0) {
      return NextResponse.json(
        { error: "process-only mode requires a non-empty `raw` field" },
        { status: 400 }
      );
    }
    const sources = sanitizeSources(body.sources);
    const verify = readVerifyMode();
    const { html, resolved, dropped, demoted } = processCitations(
      body.raw,
      sources,
      { verify }
    );
    return NextResponse.json({
      html,
      resolved,
      dropped,
      demoted,
    });
  }

  // -------------------- full --------------------
  const baseUrl = request.headers.get(AI_HEADER_BASE_URL)?.trim() ?? "";
  const apiKey = request.headers.get(AI_HEADER_API_KEY)?.trim() ?? "";
  const model = request.headers.get(AI_HEADER_MODEL)?.trim() ?? "";

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json(
      {
        error:
          "AI provider not configured. Open the user menu → Configure AI and set a base URL, API key, and model.",
      },
      { status: 412 }
    );
  }

  const cleaned = cleanMessages(body.messages);
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "messages must end with a user turn" },
      { status: 400 }
    );
  }

  const sources = sanitizeSources(body.sources);
  const sourcesBlock = renderSourcesBlock(sources);
  const providerMessages = buildProviderMessages(
    SYSTEM_PROMPT_RULES,
    sourcesBlock,
    cleaned
  );

  const createdAt = Date.now();
  const promptHash = await computePromptHashHex(
    SYSTEM_PROMPT_RULES,
    sourcesBlock,
    JSON.stringify(cleaned)
  );

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  let providerJson: ProviderResponse;
  try {
    const response = await fetch(`${normalizedBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: providerMessages,
      }),
    });
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 500);
      return NextResponse.json(
        {
          error: `Provider returned ${response.status}`,
          details: text,
        },
        { status: 502 }
      );
    }
    providerJson = (await response.json()) as ProviderResponse;
  } catch (err) {
    // undici (Node's fetch) collapses every low-level network failure
    // into the opaque string `"fetch failed"` and stashes the real cause
    // on `.cause`. When this route runs on Vercel and the configured
    // base URL points at something the function can't reach (a user's
    // localhost / LAN IP / VPN host / typo'd domain), the surface error
    // is useless without that extra context. The Electron client path
    // bypasses this entirely by fetching the provider via IPC on the
    // user's own machine — see electron/main.ts `studygit:ai-fetch`.
    const rawMessage = (err as Error)?.message ?? "ai request failed";
    const cause = (err as { cause?: unknown }).cause;
    const causeMessage =
      cause && typeof cause === "object" && "message" in cause
        ? String((cause as { message: unknown }).message ?? "")
        : "";
    const causeCode =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code: unknown }).code ?? "")
        : "";

    const isFetchFailed = rawMessage === "fetch failed";
    const isConnectionFailure =
      isFetchFailed ||
      /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)$/i.test(
        causeCode
      );

    let host = "";
    try {
      host = new URL(normalizedBase).hostname;
    } catch {
      host = "";
    }

    const isLoopbackOrPrivate =
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[fc|\[fd)/i.test(
        host
      ) ||
      // Heuristic for corp split-horizon DNS / VPN-only hostnames.
      // These resolve fine on the user's laptop but ENOTFOUND from a
      // Vercel function. Catches obvious `*-private.*` / `*.internal`
      // / `*.corp` / `*.local` patterns; the message we emit explains
      // the architectural fix either way.
      /(?:^|\.)(?:internal|corp|intranet|local|private|lan)(?:\.|$)/i.test(host) ||
      /-private\./i.test(host);

    if (isConnectionFailure) {
      const target = host || normalizedBase;
      const reason = isLoopbackOrPrivate
        ? `the server can't reach ${target} — private / VPN / LAN URLs only work when /api/ai runs on the same network as the AI provider. In the packaged Electron app this is solved by routing the fetch through the main process (window.studygit.aiFetch). If you're seeing this in the web app, switch to a publicly reachable provider URL.`
        : `the server couldn't connect to ${target}. Check that the AI base URL is correct and publicly reachable.`;
      return NextResponse.json(
        {
          error: "Couldn't reach AI provider",
          details: `${reason}${causeCode ? ` (${causeCode})` : ""}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: rawMessage,
        details: causeMessage || undefined,
      },
      { status: 502 }
    );
  }

  const raw = providerJson.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    return NextResponse.json(
      { error: "empty answer from model" },
      { status: 502 }
    );
  }

  const verify = readVerifyMode();
  const { html, resolved, dropped, demoted } = processCitations(
    raw,
    sources,
    { verify }
  );

  const provenance: AiProvenance = {
    model,
    baseUrlHost: hostnameOrEmpty(baseUrl),
    promptHash,
    createdAt,
    finishedAt: Date.now(),
    citationsResolved: resolved,
    citationsDropped: dropped,
    citationsDemoted: demoted,
    usage: providerJson.usage,
  };

  const payload: AiAnswerPayload = {
    answer: html,
    provenance,
  };
  return NextResponse.json(payload);
}

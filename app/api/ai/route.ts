import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RequestBody = {
  question: string;
  context?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  source?: string;
};

function fallbackAnswer(body: RequestBody): string {
  const q = body.question.trim();
  const ctx = (body.context ?? "").trim();
  const excerpt = ctx.length > 240 ? `${ctx.slice(0, 240)}…` : ctx;
  return [
    "AI is not configured on this server yet.",
    "",
    "To enable real answers, set an `OPENAI_API_KEY` environment variable and",
    "restart the dev server. personalGIt will then send your highlighted excerpt",
    "and question to OpenAI and stream a real response here.",
    "",
    ctx ? `Highlighted excerpt (${ctx.length} chars):\n"${excerpt}"` : "",
    q ? `Your question: ${q}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.question?.trim()) {
    return NextResponse.json(
      { error: "missing question" },
      { status: 400 }
    );
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ answer: fallbackAnswer(body) });
  }

  const systemContent = [
    "You are an assistant embedded in personalGIt, a personal learning canvas.",
    "The user is reading a document and has highlighted an excerpt to discuss.",
    "Be concise (4–10 sentences unless asked to elaborate), honest about",
    "uncertainty, and explain like you would to a curious engineer.",
    "When helpful, quote short phrases from the excerpt in backticks.",
  ].join(" ");

  const messages: ChatMessage[] = [{ role: "system", content: systemContent }];

  if (body.context?.trim()) {
    messages.push({
      role: "user",
      content: `Here is the excerpt I highlighted${
        body.source ? ` (from ${body.source})` : ""
      }:\n\n"""\n${body.context.trim()}\n"""`,
    });
    messages.push({
      role: "assistant",
      content:
        "Got it. I'll use this excerpt as the primary context for your questions.",
    });
  }

  for (const entry of body.history ?? []) {
    if (!entry.text?.trim()) continue;
    messages.push({ role: entry.role, content: entry.text });
  }

  messages.push({ role: "user", content: body.question.trim() });

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `OpenAI error (${response.status})`,
          details: errorText.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return NextResponse.json(
        { error: "empty answer from model" },
        { status: 502 }
      );
    }
    return NextResponse.json({ answer, model });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "ai request failed" },
      { status: 500 }
    );
  }
}

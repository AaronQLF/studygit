"use client";

// Single client-side entry point for pushing a file at /api/upload.
// Shared by the PDF node card and the PDF panel (previously each inlined
// its own fetch + ad-hoc error handling).
//
// The important bit is failure legibility: in supabase mode the auth
// proxy redirects protected routes to /login when the user isn't signed
// in. `fetch` transparently follows that 307, so a naive caller ends up
// calling `res.json()` on the login *HTML* and surfaces a baffling
// "Unexpected token '<'" error. We detect the redirect (and any other
// non-JSON response) and throw a message that actually tells the user
// what to do.

export type UploadedAsset = {
  url: string;
  key?: string;
  name: string;
  size?: number;
};

export async function uploadFileToServer(file: File): Promise<UploadedAsset> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body: form });
  } catch (err) {
    throw new Error(
      `Couldn't reach the server to upload. ${(err as Error).message}`
    );
  }

  // Landed on the login page → the auth proxy bounced us because there's
  // no signed-in session (supabase mode with an expired/absent session,
  // or an unreachable Supabase project).
  if (res.redirected && safePathname(res.url) === "/login") {
    throw new Error(
      "Not signed in — your session isn't active, so the upload was blocked. Sign in again, or run local dev with PERSISTENCE=file."
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(extractError(text) || `Upload failed (${res.status}).`);
  }

  // A 200 that isn't JSON almost always means we silently followed a
  // redirect to an HTML page (login, error). Don't try to JSON.parse it.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Upload failed: the server returned an unexpected response. Are you signed in?"
    );
  }

  const json = (await res.json()) as Partial<UploadedAsset>;
  if (!json?.url || !json?.name) {
    throw new Error("Upload failed: the server didn't return a file URL.");
  }
  return json as UploadedAsset;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

// The route emits `{ error }` JSON for known failures (401, bad type,
// missing file). Pull the message out when present; otherwise return the
// raw text so the caller still shows something useful.
function extractError(text: string): string {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return text;
}

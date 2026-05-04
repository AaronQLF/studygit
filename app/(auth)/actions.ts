"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/server/supabase/server";

export type AuthFormState =
  | {
      error?: string;
      info?: string;
    }
  | undefined;

function isSafeRelativePath(path: string | null): path is string {
  if (!path) return false;
  return path.startsWith("/") && !path.startsWith("//");
}

async function getOriginFromHeaders(): Promise<string> {
  const h = await headers();
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Unable to derive request origin");
  return `${proto}://${host}`;
}

export async function login(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && isSafeRelativePath(nextRaw) ? nextRaw : "/app";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  redirect(next);
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && isSafeRelativePath(nextRaw) ? nextRaw : "/app";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  const supabase = await getSupabaseServerClient();
  const origin = await getOriginFromHeaders();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return { error: error.message };
  }

  // If email confirmation is enabled, no session is returned and the user
  // must click the link in their inbox before logging in.
  if (!data.session) {
    return {
      info: "Check your email to confirm your account, then log in.",
    };
  }

  redirect(next);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && isSafeRelativePath(nextRaw) ? nextRaw : "/app";

  const supabase = await getSupabaseServerClient();
  const origin = await getOriginFromHeaders();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data?.url) {
    throw new Error("Supabase did not return an OAuth redirect URL");
  }
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

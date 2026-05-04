"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  login,
  signInWithGoogle,
  signup,
  type AuthFormState,
} from "@/app/(auth)/actions";

type AuthFormProps = {
  mode: "login" | "signup";
  next?: string;
};

export function AuthForm({ mode, next = "/app" }: AuthFormProps) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    undefined
  );

  const title = mode === "login" ? "Log in" : "Create your account";
  const submitLabel = mode === "login" ? "Log in" : "Sign up";
  const altPrompt =
    mode === "login" ? "Don't have an account?" : "Already have an account?";
  const altHref = mode === "login" ? "/signup" : "/login";
  const altLabel = mode === "login" ? "Sign up" : "Log in";

  return (
    <div className="rounded-[var(--pg-radius-lg)] border border-[var(--pg-border)] bg-[var(--pg-bg-subtle)] shadow-[var(--pg-shadow)] p-6">
      <h1 className="pg-serif text-[28px] italic font-medium tracking-tight text-[var(--pg-fg)] mb-1">
        {title}
      </h1>
      <p className="text-[12.5px] text-[var(--pg-muted)] mb-5">
        {mode === "login"
          ? "Welcome back. Continue to your canvas."
          : "Start your personal learning canvas."}
      </p>

      <form action={signInWithGoogle} className="mb-3">
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-[var(--pg-radius)] border border-[var(--pg-border-strong)] bg-[var(--pg-bg)] text-[13px] font-medium text-[var(--pg-fg)] hover:bg-[var(--pg-bg-elevated)] transition-colors"
        >
          <GoogleGlyph />
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3 my-4 text-[11px] text-[var(--pg-muted)] uppercase tracking-wider">
        <div className="flex-1 h-px bg-[var(--pg-border)]" />
        or
        <div className="flex-1 h-px bg-[var(--pg-border)]" />
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1.5 text-[12px] text-[var(--pg-fg-soft)]">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="h-9 px-3 rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] text-[13px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)] focus:ring-2 focus:ring-[var(--pg-accent-soft)]"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[12px] text-[var(--pg-fg-soft)]">
          Password
          <input
            type="password"
            name="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="h-9 px-3 rounded-[var(--pg-radius)] border border-[var(--pg-border)] bg-[var(--pg-bg)] text-[13px] text-[var(--pg-fg)] outline-none focus:border-[var(--pg-border-strong)] focus:ring-2 focus:ring-[var(--pg-accent-soft)]"
          />
          {mode === "signup" ? (
            <span className="text-[11px] text-[var(--pg-muted)]">
              At least 8 characters.
            </span>
          ) : null}
        </label>

        {state?.error ? (
          <p className="text-[12px] text-[var(--pg-accent)] bg-[var(--pg-accent-soft)] rounded-[var(--pg-radius)] px-2.5 py-1.5">
            {state.error}
          </p>
        ) : null}
        {state?.info ? (
          <p className="text-[12px] text-[var(--pg-fg-soft)] bg-[var(--pg-bg-elevated)] rounded-[var(--pg-radius)] px-2.5 py-1.5">
            {state.info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 h-9 inline-flex items-center justify-center gap-2 rounded-[var(--pg-radius)] bg-[var(--pg-accent)] text-[13px] font-medium text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitLabel}
        </button>
      </form>

      <p className="mt-5 text-[12px] text-[var(--pg-muted)] text-center">
        {altPrompt}{" "}
        <Link
          href={altHref}
          className="text-[var(--pg-fg)] hover:text-[var(--pg-accent)] underline underline-offset-2"
        >
          {altLabel}
        </Link>
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.9v2.32A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.9A9 9 0 0 0 0 9c0 1.45.35 2.82.9 4.04l3.07-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .9 4.96L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

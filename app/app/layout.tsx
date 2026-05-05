import type { Metadata } from "next";
import { getPersistenceMode } from "@/lib/persistence";
import { verifySession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "personalGit",
};

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Defense in depth: proxy.ts already redirects unauthenticated visitors,
  // but we re-verify here so a misconfigured matcher can't expose the canvas.
  // In file mode there is no auth at all, so we must NOT touch the Supabase
  // resolver — it requires NEXT_PUBLIC_SUPABASE_* env vars and would 500.
  if (getPersistenceMode() === "supabase") {
    await verifySession();
  }
  return <>{children}</>;
}

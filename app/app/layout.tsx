import type { Metadata } from "next";
import { getPersistenceMode } from "@/lib/persistence";
import { getCurrentUser, verifySession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "personalGit",
};

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Defense in depth: proxy.ts already redirects unauthenticated visitors,
  // but we re-verify here so a misconfigured matcher can't expose the canvas.
  if (getPersistenceMode() === "supabase") {
    await verifySession();
  } else {
    // Touch the cached resolver in file mode too so the prop typing stays
    // uniform (returns null when no Supabase session is configured).
    await getCurrentUser();
  }
  return <>{children}</>;
}

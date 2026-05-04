import { AppShell } from "@/components/AppShell";
import { getPersistenceMode } from "@/lib/persistence";
import { getCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user =
    getPersistenceMode() === "supabase" ? await getCurrentUser() : null;
  return <AppShell user={user} />;
}

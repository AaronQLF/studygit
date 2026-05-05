import { AppShell } from "@/components/AppShell";
import { tryGetCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  // Resolve auth regardless of PERSISTENCE so the user can always sign out
  // when a Supabase session is present (e.g. switched from supabase mode to
  // file mode but the cookie is still around).
  const user = await tryGetCurrentUser();
  return <AppShell user={user} />;
}

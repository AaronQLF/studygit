import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "./supabase/server";

export const getCurrentUser = cache(async () => getSessionUser());

// Like getCurrentUser, but never throws. Use this from anywhere that wants to
// surface a "Sign out" affordance regardless of PERSISTENCE mode — including
// dev/file mode where Supabase env vars may not be set at all.
export const tryGetCurrentUser = cache(async () => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
});

export async function verifySession(): Promise<{
  id: string;
  email: string | null;
}> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

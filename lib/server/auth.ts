import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "./supabase/server";

export const getCurrentUser = cache(async () => getSessionUser());

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

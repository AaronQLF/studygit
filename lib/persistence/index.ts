import { createFileDriver } from "./file";
import { createSupabaseDriver } from "./supabase";
import type { PersistenceDriver, PersistenceMode } from "./types";

let cachedFileDriver: PersistenceDriver | null = null;
let cachedSupabaseDriver: PersistenceDriver | null = null;

export function getPersistenceMode(): PersistenceMode {
  return process.env.PERSISTENCE === "supabase" ? "supabase" : "file";
}

export function getDriver(): PersistenceDriver {
  if (getPersistenceMode() === "supabase") {
    if (!cachedSupabaseDriver) {
      cachedSupabaseDriver = createSupabaseDriver();
    }
    return cachedSupabaseDriver;
  }
  if (!cachedFileDriver) {
    cachedFileDriver = createFileDriver();
  }
  return cachedFileDriver;
}

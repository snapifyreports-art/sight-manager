import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "job-photos";

let _supabase: SupabaseClient | null = null;

// Lazy-init Supabase client (avoids build errors when env vars are missing)
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for photo uploads"
      );
    }

    _supabase = createClient(url, key);
  }
  return _supabase;
}

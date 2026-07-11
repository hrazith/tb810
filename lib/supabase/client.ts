import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}

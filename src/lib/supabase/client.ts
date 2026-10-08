"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browserclient: uitsluitend publishable key; alle toegang via RLS. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

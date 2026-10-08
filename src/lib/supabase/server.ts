import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { serverEnv } from "@/lib/env";

/**
 * Supabase-client voor Server Components, Server Actions en Route Handlers.
 * Gebruikt de publishable key + sessiecookie van de gebruiker: alle queries
 * vallen onder Row Level Security.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Aangeroepen vanuit een Server Component: de proxy ververst de sessie.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp, createNonce } from "@/lib/csp";

// /api/cron heeft geen gebruikerssessie; de route eist zelf het CRON_SECRET.
const PUBLIC_PATHS = ["/inloggen", "/wachtwoord-vergeten", "/registreren", "/auth", "/api/cron"];

/**
 * Ververst de Supabase-sessie bij elk verzoek en stuurt niet-ingelogde
 * gebruikers naar de inlogpagina. Autorisatie per resource gebeurt daarnaast
 * altijd server-side (Data Access Layer + RLS); de proxy is geen beveiligingsgrens.
 *
 * Zet daarnaast per verzoek een Content-Security-Policy met nonce (zie
 * `src/lib/csp.ts`). De CSP staat ook op de requestheaders, zodat Next.js de
 * nonce tijdens het renderen oppikt en op zijn eigen <script>-tags zet. Elke
 * respons die de proxy teruggeeft (ook 503, 401 en redirects) krijgt de CSP.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce);
  const withCsp = <T extends Response>(res: T): T => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  // Bouwt de doorgestuurde request opnieuw op uit request.headers (incl. door
  // Supabase bijgewerkte cookies) en voegt nonce en CSP toe.
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  };

  let response = next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return withCsp(new NextResponse("Applicatie is niet geconfigureerd", { status: 503 }));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isAuthenticated && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return withCsp(
        NextResponse.json({ error: { code: "niet_ingelogd", message: "U bent niet ingelogd." } }, { status: 401 }),
      );
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/inloggen";
    redirect.search = pathname !== "/" ? `?volgende=${encodeURIComponent(pathname)}` : "";
    return withCsp(NextResponse.redirect(redirect));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/inloggen", "/wachtwoord-vergeten", "/registreren", "/auth"];

/**
 * Ververst de Supabase-sessie bij elk verzoek en stuurt niet-ingelogde
 * gebruikers naar de inlogpagina. Autorisatie per resource gebeurt daarnaast
 * altijd server-side (Data Access Layer + RLS); de proxy is geen beveiligingsgrens.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new NextResponse("Applicatie is niet geconfigureerd", { status: 503 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
      return NextResponse.json({ error: { code: "niet_ingelogd", message: "U bent niet ingelogd." } }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/inloggen";
    redirect.search = pathname !== "/" ? `?volgende=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(redirect);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

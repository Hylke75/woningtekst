/**
 * Content Security Policy met per-request nonce (zie Next.js-gids
 * "Content Security Policy", sectie "Adding a nonce with Proxy").
 *
 * - script-src: alleen scripts met de nonce van dit verzoek; via
 *   'strict-dynamic' mogen die scripts hun eigen chunks laden. Next.js leest de
 *   nonce uit de `Content-Security-Policy`-requestheader en zet hem zelf op alle
 *   framework-, bundle- en inline scripts. `'unsafe-eval'` alleen in development
 *   (React-debugging); in productie gebruiken React en Next.js geen eval.
 * - style-src: blijft bewust `'unsafe-inline'` (zonder nonce). Radix UI
 *   (positionering van popovers/tooltips), sonner (injecteert een <style>-tag
 *   zonder nonce) en de TipTap-editor zetten inline style-attributen; die zijn
 *   niet met een nonce toe te staan. Een nonce in style-src zou bovendien
 *   `'unsafe-inline'` uitschakelen. Inline CSS kan geen code uitvoeren; het
 *   restrisico (CSS-injectie) is beperkt en gemitigeerd door HTML-sanitisatie.
 * - connect-src: eigen origin plus de Supabase-URL (https en wss voor realtime).
 */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function buildCsp(nonce: string, supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = supabaseUrl ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")}`.trim(),
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

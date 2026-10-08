/** Alleen interne, relatieve paden toestaan als doorstuurdoel (voorkomt open redirects). */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.includes("://")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

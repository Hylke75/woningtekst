const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" });
const dateOnly = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "Europe/Amsterdam" });
const currency = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const currencyPrecise = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const number = new Intl.NumberFormat("nl-NL");

export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTime.format(new Date(v)) : "—");
export const formatDate = (v: string | Date | null | undefined) => (v ? dateOnly.format(new Date(v)) : "—");
export const formatPrice = (v: number | null | undefined) => (v === null || v === undefined ? "—" : currency.format(v));
export const formatCost = (v: number | null | undefined) => currencyPrecise.format(Number(v ?? 0));
export const formatNumber = (v: number | null | undefined) => (v === null || v === undefined ? "—" : number.format(v));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function relativeTime(v: string | Date): string {
  const diff = Date.now() - new Date(v).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} ${d === 1 ? "dag" : "dagen"} geleden`;
  return formatDate(v);
}

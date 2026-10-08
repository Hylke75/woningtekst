import Link from "next/link";

export function Brand() {
  return (
    <Link href="/dashboard" className="block px-3 py-1">
      <span className="block text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">Korff de Gidts</span>
      <span className="block text-[15px] font-semibold tracking-tight text-foreground">Woningtekst Studio</span>
    </Link>
  );
}

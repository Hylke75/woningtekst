"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PropertyTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/woningen/${id}`;
  const tabs = [
    { href: base, label: "Overzicht", exact: true },
    { href: `${base}/gegevens`, label: "Gegevens" },
    { href: `${base}/bronnen`, label: "Bronnen en controle" },
    { href: `${base}/teksten`, label: "Teksten" },
  ];
  return (
    <nav aria-label="Woningonderdelen" className="-mx-1 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href) || (t.label === "Bronnen en controle" && pathname.endsWith("/snelle-invoer"));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "border-primary text-primary hover:text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

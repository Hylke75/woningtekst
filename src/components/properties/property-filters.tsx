"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LISTING_STATUS_LABELS, WORKFLOW_LABELS } from "@/lib/domain/labels";
import { PROPERTY_TYPES } from "@/lib/domain/property-fields";

const ALL = "__alle__";

export function PropertyFilters({ showArchived = false }: { showArchived?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "workflow", "listing", "type", "mine", "archived"].some((k) => params.has(k));

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative lg:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op adres, plaats, wijk of postcode"
          aria-label="Zoeken"
          className="h-9 bg-card pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={params.get("workflow") ?? ALL} onValueChange={(v) => update("workflow", v)}>
          <SelectTrigger className="h-9 w-40 bg-card" aria-label="Status teksten">
            <SelectValue placeholder="Workflow" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle statussen</SelectItem>
            {Object.entries(WORKFLOW_LABELS)
              .filter(([k]) => k !== "gearchiveerd")
              .map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={params.get("listing") ?? ALL} onValueChange={(v) => update("listing", v)}>
          <SelectTrigger className="h-9 w-48 bg-card" aria-label="Verkoopstatus">
            <SelectValue placeholder="Verkoopstatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle verkoopstatussen</SelectItem>
            {Object.entries(LISTING_STATUS_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("type") ?? ALL} onValueChange={(v) => update("type", v)}>
          <SelectTrigger className="h-9 w-44 bg-card" aria-label="Woningtype">
            <SelectValue placeholder="Woningtype" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle woningtypes</SelectItem>
            {PROPERTY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch id="mine" checked={params.get("mine") === "1"} onCheckedChange={(c) => update("mine", c ? "1" : null)} />
          <Label htmlFor="mine" className="text-sm font-normal">
            Mijn woningen
          </Label>
        </div>
        {showArchived ? (
          <div className="flex items-center gap-2 px-1">
            <Switch id="archived" checked={params.get("archived") === "1"} onCheckedChange={(c) => update("archived", c ? "1" : null)} />
            <Label htmlFor="archived" className="text-sm font-normal">
              Gearchiveerd
            </Label>
          </div>
        ) : null}
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X /> Wissen
          </Button>
        ) : null}
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Laden" /> : null}
      </div>
    </div>
  );
}

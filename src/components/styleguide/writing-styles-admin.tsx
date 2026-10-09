"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/status-badge";
import { saveWritingStyle } from "@/app/(app)/schrijfwijzer/actions";
import type { WritingStyleRow } from "@/lib/content/writing-styles";
import { formatDateTime } from "@/lib/format";
import { HelpTip } from "@/components/common/help-tip";

type Draft = { id?: string; name: string; label: string; description: string; instruction: string; isActive: boolean; sortOrder: number };

const toDraft = (s: WritingStyleRow): Draft => ({
  id: s.id,
  name: s.name,
  label: s.label,
  description: s.description,
  instruction: s.instruction,
  isActive: s.is_active,
  sortOrder: s.sort_order,
});

const EMPTY: Draft = { name: "", label: "", description: "", instruction: "", isActive: true, sortOrder: 100 };

function StyleForm({ initial, onSaved, submitLabel }: { initial: Draft; onSaved: () => void; submitLabel: string }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const key = initial.id ?? "nieuw";
  const changed = JSON.stringify(d) !== JSON.stringify(initial);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveWritingStyle(d);
        setBusy(false);
        if (res.ok) {
          toast.success("Schrijfstijl opgeslagen. Nieuwe generaties gebruiken deze versie.");
          if (!initial.id) setD(EMPTY);
          onSaved();
        } else toast.error(res.error.message);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`ws-naam-${key}`}>Makelaar (naam)</Label>
            <HelpTip label="Makelaar (naam)">Korte naam van de makelaar, bijv. Wim. Verschijnt bij de versie van een tekst (“stijl Wim”) en moet uniek zijn binnen het kantoor.</HelpTip>
          </div>
          <Input id={`ws-naam-${key}`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required maxLength={40} className="bg-card" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`ws-titel-${key}`}>Titel in de keuzelijst</Label>
            <HelpTip label="Titel in de keuzelijst">Zo ziet de stijl eruit in de keuzelijsten bij een nieuwe woning en op het tabblad Teksten, bijv. “Wim – zeer zakelijk”.</HelpTip>
          </div>
          <Input id={`ws-titel-${key}`} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} required maxLength={80} className="bg-card" placeholder="Bijv. Wim – zeer zakelijk" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`ws-omschrijving-${key}`}>Korte omschrijving</Label>
          <HelpTip label="Korte omschrijving">Eén regel die de stijl samenvat, getoond onder de titel in de keuzelijst. Wordt niet naar Claude gestuurd.</HelpTip>
        </div>
        <Input id={`ws-omschrijving-${key}`} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} maxLength={200} className="bg-card" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`ws-instructie-${key}`}>Stijlinstructie voor Claude</Label>
          <HelpTip label="Stijlinstructie voor Claude">Deze tekst gaat letterlijk naar Claude bij het schrijven. Beschrijf toon, zinslengte, woordkeus, aanspreekvorm en lengte per kanaal. Hoe concreter, hoe groter het verschil. Feiten- en privacyregels gelden altijd.</HelpTip>
        </div>
        <Textarea id={`ws-instructie-${key}`} value={d.instruction} onChange={(e) => setD({ ...d, instruction: e.target.value })} rows={12} maxLength={8000} className="bg-card text-[13px]" />
        <p className="text-xs text-muted-foreground">Beschrijf toon, zinslengte, woordkeus en lengte. Feiten, privacyregels en de vaste Funda-opbouw gelden altijd, ongeacht de stijl.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.isActive} onCheckedChange={(c) => setD({ ...d, isActive: c })} aria-label="Stijl actief" /> Actief (zichtbaar in de keuzelijst)
        </label>
        <Button type="submit" size="sm" disabled={busy || !changed}>
          {busy ? <Loader2 className="animate-spin" /> : initial.id ? <Save /> : <Plus />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function WritingStylesSection({ styles, canEdit, names }: { styles: WritingStyleRow[]; canEdit: boolean; names: Record<string, string> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const refresh = () => startTransition(() => router.refresh());
  return (
    <section aria-labelledby="schrijfstijlen" className="mb-8 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="schrijfstijlen" className="text-base font-semibold">
            Schrijfstijlen per makelaar
          </h2>
          <p className="text-sm text-muted-foreground">
            Bij een nieuwe woning kiest u de makelaar; diens stijl is dan de standaard bij het genereren. Op het tabblad Teksten kunt u per generatie een andere stijl kiezen.
          </p>
        </div>
        {canEdit && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Nieuwe schrijfstijl
          </Button>
        ) : null}
      </div>
      {!canEdit ? <p className="text-xs text-muted-foreground">Alleen een administrator (met twee-stapsverificatie) kan schrijfstijlen wijzigen.</p> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {styles.map((s) => (
          <article key={s.id} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-start gap-2">
              <UserPen className="mt-0.5 size-4 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              {!s.is_active ? <StatusBadge>Uit</StatusBadge> : null}
            </div>
            {canEdit ? (
              <StyleForm key={s.updated_at} initial={toDraft(s)} onSaved={refresh} submitLabel="Opslaan" />
            ) : (
              <details>
                <summary className="cursor-pointer text-sm text-primary">Stijlinstructie bekijken</summary>
                <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{s.instruction}</p>
              </details>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Laatst gewijzigd {formatDateTime(s.updated_at)}
              {s.updated_by && names[s.updated_by] ? ` door ${names[s.updated_by]}` : ""}
            </p>
          </article>
        ))}
        {styles.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen schrijfstijlen.</p> : null}
      </div>
      {adding ? (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Nieuwe schrijfstijl</h3>
          <StyleForm
            initial={EMPTY}
            submitLabel="Toevoegen"
            onSaved={() => {
              setAdding(false);
              refresh();
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

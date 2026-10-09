"use client";

import { useState } from "react";
import { ClipboardPaste, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STANDARD_STYLE, STANDARD_STYLE_LABEL } from "@/lib/content/writing-styles";

type StyleOption = { id: string; label: string; description: string };

const OPTIONS = [
  {
    mode: "snel",
    icon: ClipboardPaste,
    title: "Snelle invoer",
    text: "Upload een verkoopdossier of plak een bestaande woningomschrijving. Claude structureert de gegevens; u controleert alles voordat er teksten worden gemaakt.",
    cta: "Start met documenten",
  },
  {
    mode: "handmatig",
    icon: ListChecks,
    title: "Handmatige invoer",
    text: "Vul de gegevens zelf in via zeven overzichtelijke secties. Wijzigingen worden automatisch tussentijds opgeslagen.",
    cta: "Start handmatig",
  },
] as const;

export function NewPropertyChooser({ styles, action }: { styles: StyleOption[]; action: (formData: FormData) => Promise<void> }) {
  const [style, setStyle] = useState<string>(STANDARD_STYLE);
  const all = [...styles, { id: STANDARD_STYLE, label: STANDARD_STYLE_LABEL, description: "De huisstijl van Korff de Gidts" }];
  const selected = all.find((s) => s.id === style);
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <Label htmlFor="nieuw-makelaar" className="text-sm font-medium">
          Makelaar
        </Label>
        <p className="mb-2 text-xs text-muted-foreground">Bepaalt de schrijfstijl van de teksten. U kunt per generatie nog een andere stijl kiezen.</p>
        <Select value={style} onValueChange={setStyle}>
          <SelectTrigger id="nieuw-makelaar" className="w-full bg-card sm:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {all.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected?.description ? <p className="mt-2 text-xs text-muted-foreground">{selected.description}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <form key={o.mode} action={action} className="flex flex-col rounded-xl border bg-card p-6">
            <input type="hidden" name="mode" value={o.mode} />
            <input type="hidden" name="writingStyleId" value={style} />
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <o.icon className="size-5" aria-hidden />
            </div>
            <h2 className="text-base font-semibold">{o.title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{o.text}</p>
            <Button type="submit" className="mt-6 self-start" variant={o.mode === "snel" ? "default" : "outline"}>
              {o.cta}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

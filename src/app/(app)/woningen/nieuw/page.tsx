import type { Metadata } from "next";
import { ClipboardPaste, ListChecks } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { createProperty } from "../actions";

export const metadata: Metadata = { title: "Nieuwe woning" };

export default async function NewPropertyPage() {
  await requirePageSession("properties.create");
  const options = [
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
  return (
    <>
      <PageHeader title="Nieuwe woning" description="Kies hoe u de woninggegevens wilt invoeren. U kunt later altijd aanvullen of corrigeren." />
      <div className="grid gap-4 md:grid-cols-2">
        {options.map((o) => (
          <form key={o.mode} action={createProperty} className="flex flex-col rounded-xl border bg-card p-6">
            <input type="hidden" name="mode" value={o.mode} />
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
    </>
  );
}

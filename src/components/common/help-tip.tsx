"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** ⓘ-icoon met uitleg bij hover of toetsenbordfocus; voor labels van invoervelden. */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      {/* Naam via verborgen tekst (niet aria-label), zodat het knopje niet als label van het veld zelf geldt. */}
      <TooltipTrigger type="button" className="inline-flex align-middle text-muted-foreground hover:text-foreground">
        <Info className="size-3.5" aria-hidden />
        <span className="sr-only">Uitleg bij {label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, { type: "success" | "error" | "info"; text: string }> = {
  "geen-rechten": { type: "error", text: "U heeft geen rechten voor die pagina." },
  "wachtwoord-ingesteld": { type: "success", text: "Uw wachtwoord is ingesteld." },
  "woning-verwijderd": { type: "success", text: "Het woningdossier is definitief verwijderd." },
};

/** Toont eenmalige meldingen uit ?melding= en verwijdert de parameter daarna. */
export function FlashMessage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("melding");
  useEffect(() => {
    if (!key) return;
    const m = MESSAGES[key];
    if (m) toast[m.type](m.text);
    const next = new URLSearchParams(params.toString());
    next.delete("melding");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [key, params, pathname, router]);
  return null;
}

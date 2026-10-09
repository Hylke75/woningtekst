"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { updateOrganizationSettings, updateOwnName } from "@/app/(app)/instellingen/actions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import type { OrganizationSettingsRow } from "@/lib/db-types";
import { HelpTip } from "@/components/common/help-tip";

export function ProfileForm({ fullName }: { fullName: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await updateOwnName(name);
        setBusy(false);
        if (res.ok) toast.success("Naam opgeslagen.");
        else toast.error(res.error.message);
        startTransition(() => router.refresh());
      }}
    >
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="naam">Volledige naam</Label>
          <HelpTip label="Volledige naam">Uw naam zoals collega’s die zien bij tekstversies, goedkeuringen en in het gebruikersbeheer.</HelpTip>
        </div>
        <Input id="naam" value={name} onChange={(e) => setName(e.target.value)} className="bg-card" autoComplete="name" />
      </div>
      <Button type="submit" disabled={busy || name.trim() === fullName}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} Opslaan
      </Button>
    </form>
  );
}

const NUMBER_FIELDS: { key: keyof OrganizationSettingsRow; label: string; help: string; tip: string; step?: string }[] = [
  { key: "ai_daily_cost_limit_eur", label: "Dagbudget AI (€)", help: "Geschatte kosten per dag voor de hele organisatie.", tip: "Maximaal geschatte Claude-kosten per kalenderdag voor het hele kantoor. Is het bereikt, dan worden nieuwe AI-verzoeken tot middernacht geweigerd.", step: "0.01" },
  { key: "ai_monthly_cost_limit_eur", label: "Maandbudget AI (€)", help: "Geschatte kosten per kalendermaand.", tip: "Maximaal geschatte Claude-kosten per kalendermaand. Bij 80% krijgen administrators een melding (als de dagelijkse controle is ingesteld); bij 100% stoppen AI-verzoeken tot de volgende maand.", step: "0.01" },
  { key: "ai_requests_per_minute_per_user", label: "AI-verzoeken per minuut per gebruiker", help: "Bescherming tegen misbruik en dubbele verzoeken.", tip: "Hoeveel AI-aanroepen één medewerker per minuut mag doen. Een volledige generatie telt als vijf aanroepen. Beschermt tegen per ongeluk herhaald klikken en misbruik." },
  { key: "ai_daily_requests_per_user", label: "AI-verzoeken per dag per gebruiker", help: "", tip: "Maximaal aantal AI-aanroepen per medewerker per dag; een extra rem naast het dagbudget van de organisatie." },
  { key: "retention_months_after_sale", label: "Bewaartermijn na verkoop (maanden)", help: "Daarna wordt het dossier ter verwijdering voorgesteld.", tip: "Na zoveel maanden sinds de status verkocht of ingetrokken komt het dossier op de lijst Bewaarbeleid. De app verwijdert nooit zelf; een administrator beslist na controle van wettelijke bewaarplichten." },
  { key: "retention_months_inactive_concept", label: "Bewaartermijn inactieve concepten (maanden)", help: "", tip: "Conceptdossiers die zo lang niet zijn gewijzigd, worden ter verwijdering voorgesteld. Ook hier verwijdert de app nooit automatisch." },
];

export function OrganizationSettingsForm({ settings }: { settings: OrganizationSettingsRow }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, String(settings[f.key])])));
  const [roles, setRoles] = useState<AppRole[]>(settings.approval_roles);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await updateOrganizationSettings({ ...(values as Record<string, string>), approval_roles: roles } as never);
        setBusy(false);
        if (res.ok) toast.success("Instellingen opgeslagen.");
        else toast.error(res.error.message);
        startTransition(() => router.refresh());
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <HelpTip label={f.label}>{f.tip}</HelpTip>
            </div>
            <Input id={f.key} type="number" min={0} step={f.step ?? "1"} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className="bg-card" />
            {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
          </div>
        ))}
      </div>
      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-medium">
          Rollen met goedkeuringsrechten
          <HelpTip label="Rollen met goedkeuringsrechten">
            Welke rollen teksten definitief mogen goedkeuren. Administrator kan altijd goedkeuren. Een redacteur kan teksten alleen ter goedkeuring aanbieden, tenzij u die rol hier aanvinkt.
          </HelpTip>
        </legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={roles.includes(r)}
                disabled={r === "admin"}
                onCheckedChange={(c) => setRoles((prev) => (c === true ? [...new Set([...prev, r])] : prev.filter((x) => x !== r)))}
              />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Standaard keuren administrator en makelaar goed.</p>
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} Instellingen opslaan
      </Button>
    </form>
  );
}

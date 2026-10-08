import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatDateTime } from "@/lib/format";

export type DashboardInsights = {
  periode_dagen?: number;
  teksten_ter_controle?: number;
  goedgekeurd_in_periode?: number;
  ongewijzigd_goedgekeurd_pct?: number | null;
  doorlooptijd_uren_mediaan?: number | null;
  kosten_maand_eur?: number;
  kosten_vandaag_eur?: number;
  kosten_per_woning_eur?: number | null;
  kosten_per_medewerker?: { naam: string; eur: number }[];
  budget?: { dag_eur: number; maand_eur: number } | null;
  mislukte_generaties_7d?: number;
  laatste_fouten?: { wanneer: string; type: string; melding: string | null; woning: string | null }[];
};

const eur = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `€ ${Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function duration(hours: number | null | undefined) {
  if (hours === null || hours === undefined) return "—";
  return hours < 48 ? `${Number(hours).toLocaleString("nl-NL")} uur` : `${Math.round(hours / 24)} dagen`;
}

export function Insights({ data, isAdmin }: { data: DashboardInsights; isAdmin: boolean }) {
  const dagPct = data.budget?.dag_eur ? Math.min(100, Math.round((100 * (data.kosten_vandaag_eur ?? 0)) / data.budget.dag_eur)) : 0;
  const maandPct = data.budget?.maand_eur ? Math.min(100, Math.round((100 * (data.kosten_maand_eur ?? 0)) / data.budget.maand_eur)) : 0;
  const tiles = [
    { label: "Ter goedkeuring", value: String(data.teksten_ter_controle ?? 0), hint: "teksten wachten op een goedkeurder" },
    { label: "Doorlooptijd (mediaan)", value: duration(data.doorlooptijd_uren_mediaan), hint: `van eerste versie tot goedkeuring, ${data.periode_dagen ?? 30} dagen` },
    {
      label: "Ongewijzigd goedgekeurd",
      value: data.ongewijzigd_goedgekeurd_pct === null || data.ongewijzigd_goedgekeurd_pct === undefined ? "—" : `${data.ongewijzigd_goedgekeurd_pct}%`,
      hint: `van ${data.goedgekeurd_in_periode ?? 0} goedgekeurde teksten was de AI-tekst direct goed`,
    },
    { label: isAdmin ? "AI-kosten deze maand" : "Uw AI-kosten deze maand", value: eur(data.kosten_maand_eur), hint: `gemiddeld ${eur(data.kosten_per_woning_eur)} per woning` },
  ];
  return (
    <section aria-labelledby="inzicht" className="mt-6 space-y-3">
      <h2 id="inzicht" className="sr-only">
        Inzicht
      </h2>
      {isAdmin && (data.mislukte_generaties_7d ?? 0) > 0 ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-destructive" /> {data.mislukte_generaties_7d} mislukte AI-taak{data.mislukte_generaties_7d === 1 ? "" : "en"} in de afgelopen 7 dagen
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {(data.laatste_fouten ?? []).map((f, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">{formatDateTime(f.wanneer)}</span>
                <span>· {f.type.replaceAll("_", " ")}</span>
                <span>· {f.melding ?? "onbekende fout"}</span>
                {f.woning ? (
                  <Link className="text-primary hover:underline" href={`/woningen/${f.woning}/teksten`}>
                    woning openen
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{t.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
          </div>
        ))}
      </div>
      {isAdmin && data.budget ? (
        <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_1fr_1.2fr]">
          <div>
            <p className="text-sm text-muted-foreground">
              Dagbudget: {eur(data.kosten_vandaag_eur)} van {eur(data.budget.dag_eur)}
            </p>
            <Progress value={dagPct} className="mt-2" aria-label="Dagbudget gebruikt" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Maandbudget: {eur(data.kosten_maand_eur)} van {eur(data.budget.maand_eur)}
            </p>
            <Progress value={maandPct} className="mt-2" aria-label="Maandbudget gebruikt" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Kosten per medewerker (deze maand)</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {(data.kosten_per_medewerker ?? []).slice(0, 4).map((m) => (
                <li key={m.naam} className="flex justify-between gap-2">
                  <span className="truncate">{m.naam}</span>
                  <span className="tabular-nums">{eur(m.eur)}</span>
                </li>
              ))}
              {(data.kosten_per_medewerker ?? []).length === 0 ? <li className="text-muted-foreground">Nog geen verbruik.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

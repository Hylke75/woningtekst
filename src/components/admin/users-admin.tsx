"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Loader2, MailPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/common/status-badge";
import { inviteUser, removeEmailDomain, revokeInvitation, setEmailDomain, updateMember } from "@/app/(app)/gebruikers/actions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";

export type MemberView = { userId: string; name: string; email: string; role: AppRole; isActive: boolean; isSelf: boolean };
export type InvitationView = { id: string; email: string; role: AppRole; createdAt: string; expiresAt: string };
export type DomainView = { domain: string; role: AppRole };

export function UsersAdmin({ members, invitations, domains }: { members: MemberView[]; invitations: InvitationView[]; domains: DomainView[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("makelaar");
  const [busy, setBusy] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [domainRole, setDomainRole] = useState<AppRole>("redacteur");
  const [lastInvite, setLastInvite] = useState<{ email: string; emailSent: boolean; registerUrl: string } | null>(null);
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5" aria-labelledby="uitnodigen">
        <h2 id="uitnodigen" className="text-base font-semibold">
          Medewerker uitnodigen
        </h2>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("invite");
            const res = await inviteUser({ email, role });
            setBusy(null);
            if (res.ok) {
              setLastInvite({ email, ...res.data });
              setEmail("");
              toast.success("Uitnodiging aangemaakt.");
              refresh();
            } else toast.error(res.error.message);
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="uitnodiging-email">E-mailadres</Label>
            <Input id="uitnodiging-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uitnodiging-rol">Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger id="uitnodiging-rol" className="w-full bg-card sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "invite" ? <Loader2 className="animate-spin" /> : <MailPlus />} Uitnodigen
          </Button>
        </form>
        {lastInvite ? (
          <p className="mt-3 rounded-lg bg-accent/50 px-3 py-2 text-sm">
            {lastInvite.emailSent
              ? `Er is een uitnodigingsmail verstuurd naar ${lastInvite.email}.`
              : `Stuur ${lastInvite.email} deze link om het account te activeren: ${lastInvite.registerUrl} (met hetzelfde e-mailadres registreren).`}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Rollen: administrator beheert gebruikers, schrijfwijzer en instellingen; makelaar maakt woningen, genereert en keurt teksten goed; redacteur bekijkt gegevens, schrijft en bewerkt teksten en biedt ze ter goedkeuring aan.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="domeinen">
        <h2 id="domeinen" className="text-base font-semibold">
          Toegang op e-maildomein
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Iedereen die zich registreert en een adres op een gekoppeld domein bevestigt, krijgt automatisch toegang met de gekozen rol. Een persoonlijke uitnodiging gaat altijd voor. Publieke domeinen zoals gmail.com zijn niet toegestaan.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("domain");
            const res = await setEmailDomain({ domain, role: domainRole });
            setBusy(null);
            if (res.ok) {
              setDomain("");
              toast.success("Domein gekoppeld.");
              refresh();
            } else toast.error(res.error.message);
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="domein">Domein</Label>
            <Input id="domein" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="korffdegidts.nl" required className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domein-rol">Standaardrol</Label>
            <Select value={domainRole} onValueChange={(v) => setDomainRole(v as AppRole)}>
              <SelectTrigger id="domein-rol" className="w-full bg-card sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="outline" disabled={busy !== null}>
            {busy === "domain" ? <Loader2 className="animate-spin" /> : <Globe />} Koppelen
          </Button>
        </form>
        {domains.length > 0 ? (
          <ul className="mt-4 divide-y rounded-lg border">
            {domains.map((d) => (
              <li key={d.domain} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium">@{d.domain}</span>
                <StatusBadge>{ROLE_LABELS[d.role]}</StatusBadge>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Domein ${d.domain} ontkoppelen`}
                  onClick={async () => {
                    const res = await removeEmailDomain(d.domain);
                    if (res.ok) toast.success("Domein ontkoppeld. Bestaande medewerkers behouden hun toegang.");
                    else toast.error(res.error.message);
                    refresh();
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="leden" className="space-y-3">
        <h2 id="leden" className="text-base font-semibold">
          Medewerkers ({members.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Naam</TableHead>
                <TableHead>E-mailadres</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Actief</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="pl-4 font-medium">
                    {m.name || "—"} {m.isSelf ? <span className="text-xs text-muted-foreground">(u)</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      disabled={m.isSelf || busy !== null}
                      onValueChange={async (v) => {
                        setBusy(m.userId);
                        const res = await updateMember({ userId: m.userId, role: v, isActive: m.isActive });
                        setBusy(null);
                        if (res.ok) toast.success("Rol gewijzigd.");
                        else toast.error(res.error.message);
                        refresh();
                      }}
                    >
                      <SelectTrigger className="h-8 w-40 bg-card" aria-label={`Rol van ${m.name || m.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.isActive}
                      disabled={m.isSelf || busy !== null}
                      aria-label={`${m.name || m.email} actief`}
                      onCheckedChange={async (c) => {
                        setBusy(m.userId);
                        const res = await updateMember({ userId: m.userId, role: m.role, isActive: c });
                        setBusy(null);
                        if (res.ok) toast.success(c ? "Account geactiveerd." : "Account gedeactiveerd.");
                        else toast.error(res.error.message);
                        refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="uitnodigingen" className="space-y-3">
        <h2 id="uitnodigingen" className="text-base font-semibold">
          Openstaande uitnodigingen
        </h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen openstaande uitnodigingen.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium">{i.email}</span>
                <StatusBadge>{ROLE_LABELS[i.role]}</StatusBadge>
                <span className="hidden text-xs text-muted-foreground sm:inline">geldig tot {formatDate(i.expiresAt)}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Uitnodiging voor ${i.email} intrekken`}
                  onClick={async () => {
                    const res = await revokeInvitation(i.id);
                    if (res.ok) toast.success("Uitnodiging ingetrokken.");
                    else toast.error(res.error.message);
                    refresh();
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

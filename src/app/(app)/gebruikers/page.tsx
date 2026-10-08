import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { PageHeader } from "@/components/common/page-header";
import { UsersAdmin, type InvitationView, type MemberView } from "@/components/admin/users-admin";
import type { AppRole } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Gebruikersbeheer" };

export default async function UsersPage() {
  const session = await requirePageSession("users.manage");
  const supabase = await createClient();
  const [membersRes, invitesRes] = await Promise.all([
    supabase.from("organization_memberships").select("user_id, role, is_active, profiles!inner(full_name, email)").order("created_at"),
    supabase.from("invitations").select("id, email, role, created_at, expires_at").is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  if (membersRes.error) throw fromDbError(membersRes.error);
  if (invitesRes.error) throw fromDbError(invitesRes.error);
  const members: MemberView[] = (membersRes.data ?? []).map((m) => {
    const p = (m as unknown as { profiles: { full_name: string; email: string } }).profiles;
    return { userId: m.user_id as string, name: p.full_name, email: p.email, role: m.role as AppRole, isActive: m.is_active as boolean, isSelf: m.user_id === session.userId };
  });
  const invitations: InvitationView[] = (invitesRes.data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as AppRole, createdAt: i.created_at, expiresAt: i.expires_at }));
  return (
    <>
      <PageHeader title="Gebruikersbeheer" description="Nodig medewerkers uit, wijs rollen toe en (de)activeer accounts. Rechten worden in de database afgedwongen." />
      <UsersAdmin members={members} invitations={invitations} />
    </>
  );
}

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { can, type AppRole, type Capability } from "@/lib/auth/permissions";

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  role: AppRole;
  approvalRoles: AppRole[];
};

/**
 * Data Access Layer: leest en verifieert de sessie (JWT-verificatie via getClaims)
 * en het lidmaatschap uit de gezaghebbende bron (organization_memberships).
 * Gememoïseerd per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub;
  if (error || !sub) return null;

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("organization_id, role, is_active, organizations(name, organization_settings(approval_roles))")
      .eq("user_id", sub)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", sub).maybeSingle(),
  ]);

  if (!membership) {
    return {
      userId: sub,
      email: profile?.email ?? String(claimsData.claims.email ?? ""),
      fullName: profile?.full_name ?? "",
      organizationId: "",
      organizationName: "",
      role: null as unknown as AppRole,
      approvalRoles: [],
    };
  }

  const m = membership as unknown as {
    organization_id: string;
    role: AppRole;
    organizations: { name: string; organization_settings: { approval_roles: AppRole[] } | null } | null;
  };

  return {
    userId: sub,
    email: profile?.email ?? String(claimsData.claims.email ?? ""),
    fullName: profile?.full_name ?? "",
    organizationId: m.organization_id,
    organizationName: m.organizations?.name ?? "",
    role: m.role,
    approvalRoles: m.organizations?.organization_settings?.approval_roles ?? ["admin", "makelaar"],
  };
});

/** Voor pagina's: stuurt door naar inloggen of de geen-toegangpagina. */
export async function requirePageSession(capability?: Capability): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/inloggen");
  if (!session.organizationId) redirect("/geen-toegang");
  if (capability && !can(session.role, capability, session.approvalRoles)) redirect("/dashboard?melding=geen-rechten");
  return session;
}

/** Voor Server Actions en Route Handlers: gooit een AppError. */
export async function requireSession(capability?: Capability): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new AppError("niet_ingelogd", "U bent niet ingelogd.");
  if (!session.organizationId) throw new AppError("geen_toegang", "Uw account is nog niet aan een organisatie gekoppeld.");
  if (capability && !can(session.role, capability, session.approvalRoles)) {
    throw new AppError("geen_toegang", "U heeft geen rechten voor deze actie.");
  }
  return session;
}

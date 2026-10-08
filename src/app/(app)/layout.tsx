import Link from "next/link";
import { needsMfaEnrollment, requirePageSession } from "@/lib/auth/session";
import { MFA_MESSAGES } from "@/lib/auth/mfa";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Brand } from "@/components/shell/brand";
import { GlobalSearch } from "@/components/shell/global-search";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const items = NAV_ITEMS.filter((i) => !i.capability || can(session.role, i.capability, session.approvalRoles));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <SidebarNav items={items} />
        </div>
        <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">{session.organizationName}</p>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
          <MobileNav items={items} />
          <GlobalSearch />
          <div className="ml-auto">
            <UserMenu name={session.fullName} email={session.email} roleLabel={ROLE_LABELS[session.role]} />
          </div>
        </header>
        {needsMfaEnrollment(session) ? (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm sm:px-6">
            {MFA_MESSAGES.inschrijving_nodig}{" "}
            <Link href="/beveiliging" className="font-medium text-primary hover:underline">
              Nu instellen
            </Link>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

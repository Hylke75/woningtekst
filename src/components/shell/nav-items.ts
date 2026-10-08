import type { Capability } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; icon: string; capability?: Capability; exact?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/woningen", label: "Woningen", icon: "home", exact: false },
  { href: "/woningen/nieuw", label: "Nieuwe woning", icon: "plus", capability: "properties.create", exact: true },
  { href: "/schrijfwijzer", label: "Schrijfwijzer", icon: "book-open" },
  { href: "/instellingen", label: "Instellingen", icon: "settings" },
  { href: "/gebruikers", label: "Gebruikersbeheer", icon: "users", capability: "users.manage" },
];

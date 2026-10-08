"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, LayoutDashboard, Plus, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

const ICONS = {
  "layout-dashboard": LayoutDashboard,
  home: Home,
  plus: Plus,
  "book-open": BookOpen,
  settings: Settings,
  users: Users,
} as const;

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/woningen") {
    return pathname === "/woningen" || (pathname.startsWith("/woningen/") && !pathname.startsWith("/woningen/nieuw"));
  }
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hoofdnavigatie" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Home;
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
              "hover:bg-accent/70 hover:text-foreground",
              active && "bg-accent text-primary hover:bg-accent hover:text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

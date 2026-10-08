"use client";

import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/(auth)/actions";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-8">
          <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">{initials || "?"}</AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight">{name || email}</span>
          <span className="block text-xs leading-tight text-muted-foreground">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{name || "Ingelogd"}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/beveiliging">
            <ShieldCheck className="size-4" />
            Beveiliging
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut className="size-4" />
              Uitloggen
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

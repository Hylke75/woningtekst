"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { Brand } from "./brand";
import type { NavItem } from "./nav-items";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu openen">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Navigatie</SheetTitle>
          <Brand />
        </SheetHeader>
        <div className="mt-6">
          <SidebarNav items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

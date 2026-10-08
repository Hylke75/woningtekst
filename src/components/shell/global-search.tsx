"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function GlobalSearch() {
  const router = useRouter();
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-sm md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
        router.push(q ? `/woningen?q=${encodeURIComponent(q)}` : "/woningen");
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input name="q" type="search" placeholder="Zoek op adres, plaats of wijk" aria-label="Zoek woningen" className="h-9 bg-background pl-9" />
    </form>
  );
}

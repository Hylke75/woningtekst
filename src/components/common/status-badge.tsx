import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/15 bg-accent text-primary",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

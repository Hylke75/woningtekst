import { StatusBadge, type Tone } from "@/components/common/status-badge";
import type { WorkflowStatus } from "@/lib/db-types";
import { WORKFLOW_LABELS } from "@/lib/domain/labels";

export function textStatus(row: { text_count: number; approved_count: number; review_count: number }): { label: string; tone: Tone } {
  if (row.text_count === 0) return { label: "Nog geen teksten", tone: "neutral" };
  if (row.approved_count === 8) return { label: "Alle 8 goedgekeurd", tone: "success" };
  if (row.review_count > 0) return { label: `${row.review_count} ter controle`, tone: "warning" };
  return { label: `${row.approved_count}/8 goedgekeurd`, tone: "primary" };
}

export function TextStatusBadge(props: { text_count: number; approved_count: number; review_count: number }) {
  const s = textStatus(props);
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

const WORKFLOW_TONES: Record<WorkflowStatus, Tone> = {
  concept: "neutral",
  in_controle: "warning",
  goedgekeurd: "success",
  gearchiveerd: "neutral",
};

export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return <StatusBadge tone={WORKFLOW_TONES[status]}>{WORKFLOW_LABELS[status]}</StatusBadge>;
}

import { aiConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { PropertyRow } from "@/lib/db-types";

export function assertTextsAllowed(property: PropertyRow) {
  if (property.deleted_at) throw new AppError("ongeldige_invoer", "Deze woning is gearchiveerd.");
  if (!aiConfigured()) throw new AppError("ai_niet_geconfigureerd", "Claude is nog niet gekoppeld. Neem contact op met een administrator.");
}

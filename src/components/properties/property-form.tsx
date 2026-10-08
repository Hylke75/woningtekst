"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, type Control, type UseFormRegister } from "react-hook-form";
import { AlertTriangle, Check, CloudOff, Info, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FIELDS, SECTIONS, fieldValueSchema, type FieldDef, type SectionId } from "@/lib/domain/property-fields";
import { optionLabel } from "@/lib/domain/labels";
import { savePropertyFields } from "@/app/(app)/woningen/actions";

export type FactHint = { status: "ai" | "conflict"; sources: number };
type FormValues = Record<string, string | boolean>;
type SaveState = { kind: "idle" | "dirty" | "saving" | "saved" | "error" | "invalid"; at?: Date; message?: string };

const EMPTY = "__leeg__";
const AUTOSAVE_MS = 1200;

function toFormDefaults(initial: Record<string, string | boolean | string[]>): FormValues {
  const out: FormValues = {};
  for (const f of FIELDS) {
    const v = initial[f.key];
    out[f.key] = Array.isArray(v) ? v.map((t) => `#${t}`).join(" ") : (v ?? (f.kind === "boolean" ? false : ""));
  }
  return out;
}

function FieldInput({ f, register, control, disabled, invalid }: { f: FieldDef; register: UseFormRegister<FormValues>; control: Control<FormValues>; disabled: boolean; invalid: boolean }) {
  const common = { id: f.key, disabled, "aria-invalid": invalid || undefined, "aria-describedby": f.help ? `${f.key}-help` : undefined };
  switch (f.kind) {
    case "textarea":
      return <Textarea {...common} {...register(f.key)} rows={f.key === "kenmerken.indeling" ? 6 : 3} className="bg-card" placeholder={f.placeholder} />;
    case "select":
      return (
        <Controller
          control={control}
          name={f.key}
          render={({ field }) => (
            <Select
              value={(field.value as string) || EMPTY}
              onValueChange={(v) => field.onChange(v === EMPTY ? "" : v)}
              disabled={disabled}
            >
              <SelectTrigger id={f.key} className="w-full bg-card" aria-invalid={invalid || undefined}>
                <SelectValue placeholder="Kies…" />
              </SelectTrigger>
              <SelectContent>
                {f.key !== "listing_status" ? <SelectItem value={EMPTY}>Niet ingevuld</SelectItem> : null}
                {f.options?.map((o) => (
                  <SelectItem key={o} value={o}>
                    {optionLabel(f.key, o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );
    case "boolean":
      return (
        <Controller
          control={control}
          name={f.key}
          render={({ field }) => (
            <div className="flex h-9 items-center gap-2">
              <Switch id={f.key} checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
              <span className="text-sm text-muted-foreground">{field.value ? "Ja" : "Nee"}</span>
            </div>
          )}
        />
      );
    case "integer":
    case "currency":
      return (
        <div className="relative">
          {f.unit === "€" ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">€</span> : null}
          <Input {...common} {...register(f.key)} inputMode="numeric" className={cn("bg-card", f.unit === "€" && "pl-7", f.unit && f.unit !== "€" && "pr-10")} />
          {f.unit && f.unit !== "€" ? (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{f.unit}</span>
          ) : null}
        </div>
      );
    default: {
      const type = f.kind === "url" ? "url" : f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : f.kind === "date" ? "date" : "text";
      return <Input {...common} {...register(f.key)} type={type} className="bg-card" placeholder={f.placeholder} autoComplete="off" />;
    }
  }
}

function serialize(f: FieldDef, value: string | boolean): unknown {
  if (f.kind === "boolean") return Boolean(value);
  if (f.kind === "tags") return String(value ?? "");
  return typeof value === "string" ? value : String(value ?? "");
}

export function PropertyForm({
  propertyId,
  initialValues,
  canEdit,
  factHints,
  documentsSlot,
}: {
  propertyId: string;
  initialValues: Record<string, string | boolean | string[]>;
  canEdit: boolean;
  factHints: Record<string, FactHint>;
  documentsSlot: React.ReactNode;
}) {
  const defaults = useMemo(() => toFormDefaults(initialValues), [initialValues]);
  const { register, control, subscribe, getValues } = useForm<FormValues>({ defaultValues: defaults });
  const lastSaved = useRef<FormValues>({ ...defaults });
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const queued = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    if (!canEdit) return;
    if (saving.current) {
      queued.current = true;
      return;
    }
    const current = getValues();
    const patch: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};
    for (const f of FIELDS) {
      if (current[f.key] === lastSaved.current[f.key]) continue;
      const value = serialize(f, current[f.key]);
      const check = fieldValueSchema(f.key).safeParse(value);
      if (!check.success) {
        nextErrors[f.key] = check.error.issues[0]?.message ?? "Ongeldige waarde";
        continue;
      }
      patch[f.key] = value;
    }
    setErrors(nextErrors);
    if (Object.keys(patch).length === 0) {
      setState(Object.keys(nextErrors).length ? { kind: "invalid", message: "Controleer de gemarkeerde velden" } : (s) => (s.kind === "dirty" ? { kind: "saved", at: s.at ?? new Date() } : s));
      return;
    }
    saving.current = true;
    setState({ kind: "saving" });
    const result = await savePropertyFields(propertyId, patch).catch(() => null);
    saving.current = false;
    if (result?.ok) {
      for (const key of Object.keys(patch)) lastSaved.current[key] = current[key];
      setState(Object.keys(nextErrors).length ? { kind: "invalid", message: "Niet alle velden opgeslagen: controleer de gemarkeerde velden" } : { kind: "saved", at: new Date() });
    } else {
      setState({ kind: "error", message: result && !result.ok ? result.error.message : "Geen verbinding. Wijzigingen worden opnieuw geprobeerd." });
      timer.current = setTimeout(() => void flushRef.current(), 5000);
    }
    if (queued.current) {
      queued.current = false;
      void flushRef.current();
    }
  }, [canEdit, getValues, propertyId]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: () => {
        setState((s) => ({ ...s, kind: "dirty" }));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
      },
    });
  }, [subscribe, flush]);

  // Waarschuw bij verlaten met niet-opgeslagen wijzigingen; sla op bij verlaten van de pagina binnen de app.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const current = getValues();
      const unsaved = FIELDS.some((f) => current[f.key] !== lastSaved.current[f.key]);
      if (unsaved) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush, getValues]);

  const sections = SECTIONS;

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <SaveIndicator state={state} canEdit={canEdit} />
          <nav aria-label="Secties" className="flex flex-col gap-0.5">
            {sections.map((s, i) => (
              <a key={s.id} href={`#sectie-${s.id}`} className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <span className="mr-2 tabular-nums text-xs">{i + 1}</span>
                {s.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="lg:hidden">
          <SaveIndicator state={state} canEdit={canEdit} />
        </div>
        {!canEdit ? (
          <p className="rounded-lg border bg-accent/50 px-4 py-3 text-sm">U kunt de woninggegevens bekijken maar niet wijzigen.</p>
        ) : null}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6" aria-label="Woninggegevens">
          {sections.map((s, i) => (
            <section key={s.id} id={`sectie-${s.id}`} className="scroll-mt-20 rounded-xl border bg-card" aria-labelledby={`kop-${s.id}`}>
              <header className="border-b px-5 py-4 sm:px-6">
                <h2 id={`kop-${s.id}`} className="text-base font-semibold">
                  <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                  {s.title}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>
              </header>
              <div className="px-5 py-5 sm:px-6">
                {s.id === "documenten" ? (
                  documentsSlot
                ) : (
                  <SectionFields
                    propertyId={propertyId}
                    section={s.id}
                    register={register}
                    control={control}
                    disabled={!canEdit}
                    errors={errors}
                    factHints={factHints}
                  />
                )}
              </div>
            </section>
          ))}
        </form>
      </div>
    </div>
  );
}

function SectionFields({
  propertyId,
  section,
  register,
  control,
  disabled,
  errors,
  factHints,
}: {
  propertyId: string;
  section: SectionId;
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  disabled: boolean;
  errors: Record<string, string>;
  factHints: Record<string, FactHint>;
}) {
  const fields = FIELDS.filter((f) => f.section === section);
  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((f) => {
        const wide = f.kind === "textarea";
        const hint = factHints[f.key];
        return (
          <div key={f.key} className={cn("space-y-1.5", wide && "sm:col-span-2 xl:col-span-3")}>
            <div className="flex items-center gap-1.5">
              <Label htmlFor={f.key} className="text-[13px]">
                {f.label}
                {f.requiredForGeneration ? <span className="text-destructive" aria-label="verplicht voor tekstgeneratie">*</span> : null}
              </Label>
              {f.help ? (
                <Tooltip>
                  <TooltipTrigger type="button" aria-label={`Toelichting ${f.label}`} className="text-muted-foreground hover:text-foreground">
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{f.help}</TooltipContent>
                </Tooltip>
              ) : null}
              {hint?.status === "conflict" ? (
                <a href={`/woningen/${propertyId}/bronnen`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3" /> Conflicterende bronnen
                </a>
              ) : hint?.status === "ai" ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-primary" title="Door AI uit een bron gehaald; nog niet bevestigd">
                  <Sparkles className="size-3" /> AI-voorstel, controleer
                </span>
              ) : null}
            </div>
            <FieldInput f={f} register={register} control={control} disabled={disabled} invalid={Boolean(errors[f.key])} />
            {errors[f.key] ? (
              <p className="text-xs text-destructive" role="alert">
                {errors[f.key]}
              </p>
            ) : f.help && f.kind === "textarea" ? (
              <p id={`${f.key}-help`} className="text-xs text-muted-foreground">
                {f.help}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SaveIndicator({ state, canEdit }: { state: SaveState; canEdit: boolean }) {
  if (!canEdit) return null;
  const time = state.at ? state.at.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "";
  const content = {
    idle: { icon: <Check className="size-3.5" />, text: "Alle wijzigingen opgeslagen", cls: "text-muted-foreground" },
    dirty: { icon: <Loader2 className="size-3.5 opacity-50" />, text: "Wijzigingen worden opgeslagen…", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Opslaan…", cls: "text-muted-foreground" },
    saved: { icon: <Check className="size-3.5" />, text: `Opgeslagen om ${time}`, cls: "text-success" },
    error: { icon: <CloudOff className="size-3.5" />, text: state.message ?? "Opslaan mislukt", cls: "text-destructive" },
    invalid: { icon: <AlertTriangle className="size-3.5" />, text: state.message ?? "Controleer de gemarkeerde velden", cls: "text-warning" },
  }[state.kind];
  return (
    <p role="status" aria-live="polite" className={cn("flex items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-medium", content.cls)}>
      <span className="mt-px">{content.icon}</span>
      <span>{content.text}</span>
    </p>
  );
}

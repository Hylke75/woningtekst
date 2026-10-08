"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthFormState } from "@/app/(auth)/actions";

type Field = {
  name: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  hint?: string;
  inputMode?: "numeric" | "text" | "email";
  pattern?: string;
  maxLength?: number;
  autoFocus?: boolean;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden,
  footer,
  notice,
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
  footer?: React.ReactNode;
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  if (state?.success) {
    return (
      <div className="space-y-4">
        <Alert className="border-success/30 bg-success/5 text-foreground">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
        <Link href="/inloggen" className="block text-center text-sm text-primary hover:underline">
          Terug naar inloggen
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate={false}>
      {notice ? (
        <Alert className="border-border bg-accent/60">
          <AlertDescription className="text-foreground">{notice}</AlertDescription>
        </Alert>
      ) : null}
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            inputMode={f.inputMode}
            pattern={f.pattern}
            maxLength={f.maxLength}
            autoFocus={f.autoFocus}
            required
            className="h-10"
          />
          {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
        </div>
      ))}
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}

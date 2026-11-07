"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormSheet } from "@/components/patterns/FormSheet";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { requestVacationAction } from "@/lib/actions/vacations-actions";
import { actionErrorText } from "@/lib/errors";
import type { VacationBalance, VacationKind, VacationRequest } from "@/lib/types/redesign";

import {
  VACATION_KIND_LABEL,
  VACATION_KIND_OPTIONS,
  daysLabel,
  isIsoDay,
  workDaysBetween,
} from "./vacation-format";

export type VacationFormProps = { balance: VacationBalance; onSubmitted(r: VacationRequest): void };

type Draft = { from: string; to: string; kind: VacationKind; comment: string };

const EMPTY: Draft = { from: "", to: "", kind: "vacaciones", comment: "" };

/**
 * Vacation request form (redesign FE §3.7) on `FormSheet`: Desde, Hasta, Tipo,
 * Comentario, "Enviar solicitud" → `requestVacationAction`. Errors
 * (`INVALID`, `OVERLAP`) show inline through `actionErrorText`. A request
 * longer than the available balance is allowed (the approver decides) and
 * shows a warning. The trigger button opens the sheet; forms ignore the style.
 */
export function VacationForm({ balance, onSubmitted }: VacationFormProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeValid = isIsoDay(draft.from) && isIsoDay(draft.to) && draft.to >= draft.from;
  const days = workDaysBetween(draft.from, draft.to);
  const remaining = balance.available - days;
  const overBalance = rangeValid && draft.kind === "vacaciones" && remaining < 0;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setDraft(EMPTY);
      setError(null);
    }
  }

  async function submit() {
    if (!rangeValid) {
      setError(actionErrorText("INVALID"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const comment = draft.comment.trim();
      const created = await requestVacationAction({
        from: draft.from,
        to: draft.to,
        kind: draft.kind,
        ...(comment ? { comment } : {}),
      });
      onSubmitted(created);
      toast.success("Solicitud enviada");
      setOpen(false);
      setDraft(EMPTY);
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden />
        Nueva solicitud
      </Button>
      <FormSheet
        title="Nueva solicitud"
        description={`Te quedan ${daysLabel(balance.available)} disponibles.`}
        open={open}
        onOpenChange={onOpenChange}
        onSubmit={submit}
        submitLabel="Enviar solicitud"
        pending={pending}
        error={error}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField className="flex flex-col gap-1.5">
              <Label>Desde</Label>
              <Input
                type="date"
                required
                value={draft.from}
                onChange={(e) => {
                  const from = e.target.value;
                  setDraft((d) => ({ ...d, from, to: d.to && d.to >= from ? d.to : from }));
                }}
              />
            </FormField>
            <FormField className="flex flex-col gap-1.5">
              <Label>Hasta</Label>
              <Input
                type="date"
                required
                min={draft.from || undefined}
                value={draft.to}
                onChange={(e) => {
                  const to = e.target.value;
                  setDraft((d) => ({ ...d, to }));
                }}
              />
            </FormField>
          </div>
          <FormField className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select
              items={VACATION_KIND_LABEL}
              value={draft.kind}
              onValueChange={(v) => {
                if (typeof v === "string" && v in VACATION_KIND_LABEL) {
                  setDraft((d) => ({ ...d, kind: v as VacationKind }));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VACATION_KIND_OPTIONS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {VACATION_KIND_LABEL[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField className="flex flex-col gap-1.5">
            <Label>Comentario</Label>
            <Textarea
              rows={3}
              maxLength={500}
              value={draft.comment}
              onChange={(e) => {
                const comment = e.target.value;
                setDraft((d) => ({ ...d, comment }));
              }}
            />
          </FormField>
          {rangeValid ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {days === 1 ? "1 día hábil" : `${days} días hábiles`}
            </p>
          ) : null}
          {overBalance ? (
            <Alert>
              <AlertDescription>
                {`Esta solicitud pasa tu saldo por ${daysLabel(-remaining)}. Puedes enviarla; quien la apruebe decide.`}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </FormSheet>
    </>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { errorId as fieldErrorId, Field, hintId } from "@/components/ajustes/AdminFields";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { saveWorkdayHoursAction } from "@/lib/actions/calendario-settings-actions";
import { DEFAULT_WORKDAY_HOURS } from "@/lib/calendario/load";
import { useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { workdayHoursOptions } from "@/lib/query/options/calendario";

export const WORKDAY_MIN = 1;
export const WORKDAY_MAX = 12;
const FIELD_ID = "general-workday-hours";

/** The error copy for a typed value, or null when it is a valid workday (1-12 h, steps of 0.5). */
export function workdayHoursError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Escribe las horas de trabajo por día.";
  const value = Number(trimmed.replace(",", "."));
  if (Number.isNaN(value)) return "Escribe un número de horas.";
  if (value < WORKDAY_MIN || value > WORKDAY_MAX) return `Debe estar entre ${WORKDAY_MIN} y ${WORKDAY_MAX} horas.`;
  if (Math.round(value * 2) !== value * 2) return "Usa saltos de media hora (por ejemplo 6 o 6.5).";
  return null;
}

/**
 * "Jornada de trabajo" of Ajustes › General (Calendario FE §6.5): "Horas de trabajo por día", the org
 * workday the Calendario load uses when a puesto has no weekly capacity. Saving refreshes the meters.
 */
export function WorkdayHoursSection() {
  const { data } = useQuery(workdayHoursOptions());
  const saved = data ?? DEFAULT_WORKDAY_HOURS;
  const [typed, setTyped] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const value = typed ?? String(saved);
  const fieldError = typed === null ? null : workdayHoursError(typed);
  const error = fieldError ?? formError;
  const dirty = typed !== null && fieldError === null && Number(typed.replace(",", ".")) !== saved;

  const save = useActionMutation(saveWorkdayHoursAction, {
    setData: (qc, result) => {
      qc.setQueryData<number>(qk.calendario.workday(), result.hours);
      setTyped(null);
      setFormError(null);
    },
    invalidate: [qk.calendario.all],
    onFormError: setFormError,
    successToast: "Guardé la jornada de trabajo.",
  });

  const onSave = () => {
    if (typed === null || fieldError) return;
    setFormError(null);
    save.mutate(Number(typed.replace(",", ".")));
  };

  return (
    <SettingsSection
      title="Jornada de trabajo"
      description="Define cuántas horas cuenta un día de trabajo en el Calendario."
      level={3}
    >
      <div className="flex flex-col gap-3.5">
        <Field
          htmlFor={FIELD_ID}
          label="Horas de trabajo por día"
          hint="Se usa para la carga del Calendario cuando el puesto no tiene capacidad semanal."
          error={error}
        >
          <Input
            id={FIELD_ID}
            type="number"
            inputMode="decimal"
            min={WORKDAY_MIN}
            max={WORKDAY_MAX}
            step={0.5}
            className="h-9 sm:max-w-40"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldErrorId(FIELD_ID)} ${hintId(FIELD_ID)}` : hintId(FIELD_ID)}
            onChange={(event) => {
              setFormError(null);
              setTyped(event.target.value);
            }}
          />
        </Field>
        <div>
          <Button type="button" onClick={onSave} disabled={!dirty || save.isPending}>
            Guardar jornada
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

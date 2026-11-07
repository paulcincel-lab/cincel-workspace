"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { RecordTable } from "@/components/widgets/RecordTable";
import { saveVacationSettingsAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { VacationSettingsView } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

export type VacationSettingsProps = {
  initial: VacationSettingsView;
  /** `canDecideVacations`; without it the section is not rendered at all. */
  canDecide: boolean;
};

export const VACATION_DAYS_MIN = 0;
export const VACATION_DAYS_MAX = 60;
export const VACATION_DAYS_ERROR = `Escribe un número entero de ${VACATION_DAYS_MIN} a ${VACATION_DAYS_MAX}.`;

/** The editable form of the settings: numbers as typed; "" in an override means "use the default". */
export type VacationSettingsDraft = { daysPerYear: string; overrides: Record<string, string> };

export type VacationSettingsInput = {
  daysPerYear: number;
  overrides: { staffId: string; days: number | null }[];
};

export type ParsedVacationSettings =
  | { ok: true; value: VacationSettingsInput }
  | { ok: false; errors: { daysPerYear?: string; overrides: Record<string, string> } };

export function draftFromView(view: VacationSettingsView): VacationSettingsDraft {
  return {
    daysPerYear: String(view.daysPerYear),
    overrides: Object.fromEntries(view.overrides.map((o) => [o.staffId, o.days === null ? "" : String(o.days)])),
  };
}

function parseDays(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= VACATION_DAYS_MIN && value <= VACATION_DAYS_MAX ? value : null;
}

/**
 * Validates the draft (whole days, 0–60; an empty override clears it) and
 * builds the `saveVacationSettingsAction` input. Every listed person is sent,
 * so clearing an override persists as `null`.
 */
export function parseVacationSettingsDraft(draft: VacationSettingsDraft, staffIds: string[]): ParsedVacationSettings {
  const errors: { daysPerYear?: string; overrides: Record<string, string> } = { overrides: {} };
  const daysPerYear = parseDays(draft.daysPerYear);
  if (daysPerYear === null) errors.daysPerYear = VACATION_DAYS_ERROR;

  const overrides: VacationSettingsInput["overrides"] = [];
  for (const staffId of staffIds) {
    const raw = (draft.overrides[staffId] ?? "").trim();
    if (raw === "") {
      overrides.push({ staffId, days: null });
      continue;
    }
    const days = parseDays(raw);
    if (days === null) errors.overrides[staffId] = VACATION_DAYS_ERROR;
    else overrides.push({ staffId, days });
  }

  if (errors.daysPerYear || Object.keys(errors.overrides).length > 0) return { ok: false, errors };
  return { ok: true, value: { daysPerYear: daysPerYear as number, overrides } };
}

/**
 * "Días de vacaciones" of Mis vacaciones (redesign FE §3.7): the organization's
 * "Días por año" and a per-person override table (empty = default), read with
 * `fetchVacationSettingsAction` and saved with `saveVacationSettingsAction`.
 * Only for `canDecideVacations` (lives here, not in Ajustes › General, because
 * Dirección decides vacations but can't open General).
 */
export function VacationSettings({ canDecide, initial }: VacationSettingsProps) {
  if (!canDecide) return null;
  return <VacationSettingsForm initial={initial} />;
}

function VacationSettingsForm({ initial }: { initial: VacationSettingsView }) {
  const router = useRouter();
  const daysId = useId();
  const daysErrorId = useId();
  const fieldPrefix = useId();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<VacationSettingsDraft>(() => draftFromView(initial));
  const [errors, setErrors] = useState<{ daysPerYear?: string; overrides: Record<string, string> }>({ overrides: {} });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canWrite = IMPLEMENTED.saveVacationSettingsAction;
  const staffIds = useMemo(() => view.overrides.map((o) => o.staffId), [view]);
  const people = useMemo(() => new Map(view.overrides.map((o) => [o.staffId, o.name])), [view]);
  const defaultLabel = parseDays(draft.daysPerYear) ?? view.daysPerYear;

  const table: RecordTableData = useMemo(
    () => ({
      columns: [
        { key: "persona", label: "Persona" },
        { key: "dias", label: "Días", align: "right" },
      ],
      rows: view.overrides.map((o) => ({ id: o.staffId, persona: o.name, dias: "" })),
    }),
    [view],
  );

  function setOverride(staffId: string, value: string) {
    setDraft((prev) => ({ ...prev, overrides: { ...prev.overrides, [staffId]: value } }));
  }

  async function save() {
    setFormError(null);
    const parsed = parseVacationSettingsDraft(draft, staffIds);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({ overrides: {} });
    setPending(true);
    try {
      const saved = await saveVacationSettingsAction(parsed.value);
      setView(saved);
      setDraft(draftFromView(saved));
      toast.success("Días de vacaciones guardados");
      router.refresh();
    } catch (err) {
      setFormError(actionErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsSection
      title="Días de vacaciones"
      description="Los días que corresponden a cada persona por año. Deja vacío para usar el valor de la organización."
      actions={
        canWrite ? (
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        ) : undefined
      }
    >
      <SettingsRow
        label="Días por año"
        description="Valor de la organización, de 0 a 60."
        htmlFor={daysId}
        control={
          <div className="flex flex-col gap-1">
            <Input
              id={daysId}
              type="number"
              inputMode="numeric"
              min={VACATION_DAYS_MIN}
              max={VACATION_DAYS_MAX}
              step={1}
              className="w-24"
              value={draft.daysPerYear}
              disabled={!canWrite || pending}
              aria-invalid={errors.daysPerYear ? true : undefined}
              aria-describedby={errors.daysPerYear ? daysErrorId : undefined}
              onChange={(event) => setDraft((prev) => ({ ...prev, daysPerYear: event.target.value }))}
            />
            {errors.daysPerYear ? (
              <p id={daysErrorId} className="text-sm text-destructive">
                {errors.daysPerYear}
              </p>
            ) : null}
          </div>
        }
      />

      {view.overrides.length > 0 ? (
        <RecordTable
          data={table}
          renderCell={(key, row) => {
            if (key !== "dias") return undefined;
            const staffId = String(row.id);
            const name = people.get(staffId) ?? "";
            const error = errors.overrides[staffId];
            const errorId = `${fieldPrefix}-${staffId}-error`;
            return (
              <div className="flex flex-col items-end gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={VACATION_DAYS_MIN}
                  max={VACATION_DAYS_MAX}
                  step={1}
                  className="w-24 text-right"
                  placeholder={String(defaultLabel)}
                  aria-label={`Días de ${name}`}
                  value={draft.overrides[staffId] ?? ""}
                  disabled={!canWrite || pending}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => setOverride(staffId, event.target.value)}
                />
                {error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        />
      ) : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsSection>
  );
}

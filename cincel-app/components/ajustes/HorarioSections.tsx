"use client";

import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { useId, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Field, FieldGrid, InsetRow, TonePill, hintId } from "@/components/ajustes/AdminFields";
import { TeamHoursTable, TRIAL_NOTE } from "@/components/ajustes/TeamHoursTable";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { OFFICIAL_CINCEL_ROLES } from "@/lib/data/roles";
import {
  CONTROL_MODE_OPTIONS,
  CONTROL_MODE_PILL,
  controlMode,
  formatDateRange,
  formatDayMonthYear,
  formatHours,
  isTrialDay,
  loginPromptPreview,
  minRequiredFrom,
  reportDays,
  WEEKDAY_SHORT,
  WORK_DAY_PILLS,
  WORK_DAY_TOGGLES,
  type ControlMode,
} from "@/lib/time-tracking/horario-copy";
import { addDays, mondayOf } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

import { useHorario } from "./horario-context";

/**
 * The sections of Ajustes › Control de horario (canvas `Ajustes-Horario`).
 * Each reads the page state with `useHorario()` (the page-scoped form store of
 * `HorarioClient` plus the hydrated page data), checks its own capability and
 * is registered in `lib/shell/settings-sections/horario/*`. With the control
 * off, only the first section shows. Only the team report changes with the
 * presentation style, inside `TeamHoursWidget`.
 */

/** Default values when a rule switch is turned back on. */
const DEFAULT_AUTO_CLOSE_AT = "20:00";
const DEFAULT_LUNCH_MINUTES = 60;

/** Report export URL of a week. */
export function horarioExportHref(weekStart: string): string {
  return `/api/horario/export?week=${encodeURIComponent(weekStart)}`;
}

function numberValue(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

// ── Control (mode cards and the mandatory date) ────────────────────────────

/** The draft for a newly chosen mode; Obligatorio keeps the saved date or starts tomorrow. */
function settingsForMode(
  mode: ControlMode,
  saved: TimeTrackingSettings,
  draft: TimeTrackingSettings,
  today: string,
): Partial<TimeTrackingSettings> {
  if (mode === "off") return { enabled: false };
  if (mode === "prueba") return { enabled: true, requiredFrom: null };
  return { enabled: true, requiredFrom: draft.requiredFrom ?? saved.requiredFrom ?? minRequiredFrom(today) };
}

export function HorarioControl() {
  const { draft, saved, update, canManage, editable, today } = useHorario();
  const dateId = useId();
  if (!canManage) return null;

  const mode = controlMode(draft);
  const pill = CONTROL_MODE_PILL[mode];

  return (
    <SettingsSection title="Activar control de horario" level={3} actions={<TonePill tone={pill.tone}>{pill.label}</TonePill>}>
      <RadioGroupPrimitive
        aria-label="Control de horario"
        value={mode}
        disabled={!editable}
        onValueChange={(next) => {
          const option = CONTROL_MODE_OPTIONS.find((o) => o.value === next);
          if (option) update(settingsForMode(option.value, saved, draft, today));
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {CONTROL_MODE_OPTIONS.map((option) => (
          <RadioPrimitive.Root
            key={option.value}
            value={option.value}
            data-slot="control-mode"
            aria-describedby={`${dateId}-${option.value}`}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left text-card-foreground outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "data-[checked]:border-2 data-[checked]:border-primary data-[checked]:p-[11px]",
              "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70",
            )}
          >
            <span className="text-[13.5px] font-semibold">{option.title}</span>
            <span id={`${dateId}-${option.value}`} className="text-[12.5px] text-muted-foreground">
              {option.description}
            </span>
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>

      {mode === "obligatorio" ? (
        <div className="sm:max-w-xs">
          <Field htmlFor={dateId} label="Obligatorio a partir de">
            <Input
              id={dateId}
              type="date"
              className="h-9 font-mono"
              value={draft.requiredFrom ?? ""}
              min={minRequiredFrom(today)}
              disabled={!editable}
              onChange={(event) => {
                if (event.target.value) update({ requiredFrom: event.target.value });
              }}
            />
          </Field>
        </div>
      ) : null}
    </SettingsSection>
  );
}

// ── Reglas de la jornada ───────────────────────────────────────────────────

function workDaysText(days: number[]): string {
  const order = WORK_DAY_TOGGLES.map((toggle) => toggle.day);
  return [...days]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((day) => WEEKDAY_SHORT[day])
    .join(", ");
}

/** Read-only summary of the rules (viewers with only `canViewTeamHours`). */
function ReglasResumen({ settings }: { settings: TimeTrackingSettings }) {
  const rows: { label: string; value: string }[] = [
    {
      label: "Control de horario",
      value: settings.enabled
        ? settings.requiredFrom
          ? `Activado · obligatorio desde el ${formatDayMonthYear(settings.requiredFrom)}`
          : "Activado · en prueba"
        : "Desactivado",
    },
    { label: "Entrada", value: settings.dayStart },
    { label: "Salida", value: settings.dayEnd },
    { label: "Horas esperadas por día", value: formatHours(settings.hoursPerDay) },
    { label: "Tolerancia de retardo", value: `${settings.lateToleranceMin} min` },
    { label: "Días laborales", value: workDaysText(settings.workDays) },
    { label: "Pedir registro de entrada al iniciar sesión", value: settings.promptAtLogin ? "Sí" : "No" },
    { label: "Cierre automático de la jornada", value: settings.autoCloseAt ?? "No" },
    { label: "Descuento de comida", value: settings.lunchMinutes > 0 ? `${settings.lunchMinutes} min` : "No" },
    { label: "Roles excluidos", value: settings.exemptRoles.length > 0 ? settings.exemptRoles.join(", ") : "Ninguno" },
  ];
  return (
    <>
      {rows.map((row) => (
        <SettingsRow
          key={row.label}
          label={row.label}
          control={<span className="text-sm text-foreground">{row.value}</span>}
        />
      ))}
    </>
  );
}

/** An inset rule row: title + hint on the left; an optional field and the switch on the right. */
function RuleRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
  children?: ReactNode;
}) {
  const switchId = useId();
  return (
    <InsetRow>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={switchId} className="text-[13px] font-medium text-foreground">
          {title}
        </Label>
        <p id={hintId(switchId)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <Switch
          id={switchId}
          aria-describedby={hintId(switchId)}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    </InsetRow>
  );
}

const NO_ROLES = "Ninguno";
const ROLE_ITEMS = Object.fromEntries(OFFICIAL_CINCEL_ROLES.map((role) => [role, role]));

function rolesText(value: unknown): string {
  const roles = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return roles.length === 0 ? NO_ROLES : roles.join(", ");
}

export function HorarioReglas() {
  const { draft, saved, update, canManage, canViewReport, editable } = useHorario();
  const ids = {
    dayStart: useId(),
    dayEnd: useId(),
    hours: useId(),
    tolerance: useId(),
    autoClose: useId(),
    lunch: useId(),
    roles: useId(),
  };
  if (!canManage && !canViewReport) return null;

  if (!canManage) {
    return (
      <SettingsSection title="Reglas de la jornada" description="Las define un administrador." level={3}>
        <ReglasResumen settings={saved} />
      </SettingsSection>
    );
  }
  if (!draft.enabled) return null;

  const disabled = !editable;
  const toggleDay = (day: number) =>
    update({
      workDays: draft.workDays.includes(day)
        ? draft.workDays.filter((d) => d !== day)
        : [...draft.workDays, day].sort((a, b) => a - b),
    });

  return (
    <SettingsSection title="Reglas de la jornada" level={3}>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-sidebar-foreground">Días laborales</legend>
        <div className="flex flex-wrap gap-1.5">
          {WORK_DAY_PILLS.map((pill) => {
            const on = draft.workDays.includes(pill.day);
            return (
              <button
                key={pill.day}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleDay(pill.day)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3.5 text-[12.5px] font-medium outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  on
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border bg-card text-sidebar-foreground hover:bg-muted",
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <FieldGrid columns={4}>
        <Field htmlFor={ids.dayStart} label="Entrada">
          <Input
            id={ids.dayStart}
            type="time"
            className="h-9 font-mono"
            value={draft.dayStart}
            disabled={disabled}
            onChange={(event) => update({ dayStart: event.target.value })}
          />
        </Field>
        <Field htmlFor={ids.dayEnd} label="Salida">
          <Input
            id={ids.dayEnd}
            type="time"
            className="h-9 font-mono"
            value={draft.dayEnd}
            disabled={disabled}
            onChange={(event) => update({ dayEnd: event.target.value })}
          />
        </Field>
        <Field htmlFor={ids.hours} label="Horas esperadas por día">
          <Input
            id={ids.hours}
            type="number"
            inputMode="decimal"
            className="h-9 font-mono"
            min={1}
            max={12}
            step={0.5}
            value={draft.hoursPerDay}
            disabled={disabled}
            onChange={(event) => update({ hoursPerDay: numberValue(event.target.value) })}
          />
        </Field>
        <Field htmlFor={ids.tolerance} label="Tolerancia de retardo" hint="En minutos.">
          <Input
            id={ids.tolerance}
            type="number"
            inputMode="numeric"
            className="h-9 font-mono"
            min={0}
            step={5}
            aria-describedby={hintId(ids.tolerance)}
            value={draft.lateToleranceMin}
            disabled={disabled}
            onChange={(event) => update({ lateToleranceMin: numberValue(event.target.value) })}
          />
        </Field>
      </FieldGrid>

      <RuleRow
        title="Descontar tiempo de comida"
        hint="Se resta de las horas del día si no se registró una pausa."
        checked={draft.lunchMinutes > 0}
        disabled={disabled}
        onChange={(checked) =>
          update({ lunchMinutes: checked ? (saved.lunchMinutes > 0 ? saved.lunchMinutes : DEFAULT_LUNCH_MINUTES) : 0 })
        }
      >
        {draft.lunchMinutes > 0 ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.lunch} className="text-xs text-sidebar-foreground">
              Minutos de comida
            </Label>
            <Input
              id={ids.lunch}
              type="number"
              inputMode="numeric"
              className="h-8 w-24 font-mono"
              min={0}
              step={5}
              value={draft.lunchMinutes}
              disabled={disabled}
              onChange={(event) => update({ lunchMinutes: numberValue(event.target.value) })}
            />
          </div>
        ) : null}
      </RuleRow>

      <RuleRow
        title="Cerrar la jornada automáticamente"
        hint="Si alguien olvida registrar su salida, se cierra y se marca para revisión."
        checked={draft.autoCloseAt !== null}
        disabled={disabled}
        onChange={(checked) => update({ autoCloseAt: checked ? (saved.autoCloseAt ?? DEFAULT_AUTO_CLOSE_AT) : null })}
      >
        {draft.autoCloseAt !== null ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.autoClose} className="text-xs text-sidebar-foreground">
              Hora de cierre
            </Label>
            <Input
              id={ids.autoClose}
              type="time"
              className="h-8 w-28 font-mono"
              value={draft.autoCloseAt}
              disabled={disabled}
              onChange={(event) => update({ autoCloseAt: event.target.value || null })}
            />
          </div>
        ) : null}
      </RuleRow>

      <div className="sm:max-w-sm">
        <Field htmlFor={ids.roles} label="Excluir roles" hint="Quienes tienen estos roles no registran horario.">
          <Select
            multiple
            items={ROLE_ITEMS}
            value={draft.exemptRoles}
            disabled={disabled}
            onValueChange={(next: unknown) => {
              const roles = Array.isArray(next) ? next.filter((v): v is string => typeof v === "string") : [];
              update({ exemptRoles: OFFICIAL_CINCEL_ROLES.filter((role) => roles.includes(role)) });
            }}
          >
            <SelectTrigger id={ids.roles} aria-describedby={hintId(ids.roles)} className="w-full">
              <SelectValue>{(value: unknown) => rolesText(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OFFICIAL_CINCEL_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </SettingsSection>
  );
}

// ── Lo que ve el equipo al iniciar sesión ──────────────────────────────────

export function HorarioVistaPrevia() {
  const { draft, update, canManage, editable, today, viewerName } = useHorario();
  const switchId = useId();
  if (!canManage || !draft.enabled) return null;
  const copy = loginPromptPreview(viewerName, draft.dayStart, draft.requiredFrom, today);
  return (
    <SettingsSection title="Lo que ve el equipo al iniciar sesión" level={3}>
      <div className="flex flex-wrap items-start gap-4">
        <InsetRow className="min-w-0 flex-[1_1_260px] flex-nowrap items-start">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor={switchId} className="text-[13px] font-medium text-foreground">
              Pedir registro de entrada al iniciar sesión
            </Label>
            <p id={hintId(switchId)} className="text-xs text-muted-foreground">
              Aparece una ventana la primera vez que alguien entra en el día.
            </p>
          </div>
          <Switch
            id={switchId}
            aria-describedby={hintId(switchId)}
            checked={draft.promptAtLogin}
            disabled={!editable}
            onCheckedChange={(checked) => update({ promptAtLogin: checked })}
          />
        </InsetRow>
        <div
          role="img"
          aria-label="Vista previa de la ventana de registro"
          className="flex min-w-0 flex-[0_1_300px] flex-col gap-2 rounded-[14px] border border-border bg-card p-4 text-card-foreground shadow-md"
        >
          <span className="text-[15px] font-semibold">{copy.title}</span>
          <span className="text-[13px] text-muted-foreground">{copy.body}</span>
          <span className="mt-1 flex flex-wrap gap-2">
            <span className={buttonVariants({ size: "sm" })}>{copy.primary}</span>
            {copy.dismiss ? <span className={buttonVariants({ variant: "ghost", size: "sm" })}>{copy.dismiss}</span> : null}
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}

// ── Horas del equipo ───────────────────────────────────────────────────────

/**
 * The team report of one week. "Semana anterior" / "Semana siguiente" change
 * the week in the page store, which is the page-data key input: one page-data
 * call per new week, no route refresh. The current week is the last one.
 */
export function HorarioHorasEquipo() {
  const { canViewReport, canManage, draft, weekStart, setWeekStart, rows, saved, today, loadingWeek } = useHorario();
  if (!canViewReport || !IMPLEMENTED.fetchTeamHoursAction) return null;
  if (canManage && !draft.enabled) return null;
  const isCurrentWeek = weekStart >= mondayOf(today);
  const days = reportDays(weekStart, saved.workDays, rows);
  const range = formatDateRange(days[0] ?? weekStart, days.at(-1) ?? addDays(weekStart, 6));
  const trial = saved.enabled && days.some((date) => isTrialDay(date, saved.requiredFrom));

  return (
    <SettingsSection
      title="Horas del equipo"
      description={trial ? TRIAL_NOTE : undefined}
      level={3}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Semana anterior"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span data-slot="week-range" aria-live="polite" className="min-w-[6.5rem] text-center font-mono text-[13px] text-foreground">
            {range}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Semana siguiente"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <a
            href={horarioExportHref(weekStart)}
            download={`horario-${weekStart}.csv`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Exportar CSV
          </a>
        </div>
      }
    >
      <TeamHoursTable weekStart={weekStart} rows={rows} workDays={saved.workDays} loading={loadingWeek} />
    </SettingsSection>
  );
}

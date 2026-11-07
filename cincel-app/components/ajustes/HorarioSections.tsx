"use client";

import { useId, type ReactNode } from "react";
import { Clock } from "lucide-react";

import { TeamHoursTable } from "@/components/ajustes/TeamHoursTable";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { useStyle } from "@/components/shell/StyleProvider";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { OFFICIAL_CINCEL_ROLES } from "@/lib/data/roles";
import {
  clockInPromptCopy,
  enabledStateCopy,
  formatDayMonth,
  formatDayMonthYear,
  formatHours,
  minRequiredFrom,
  timelineSegments,
  WEEKDAY_SHORT,
  WORK_DAY_TOGGLES,
  type TimelineSegment,
} from "@/lib/time-tracking/horario-copy";
import type { TimeTrackingSettings } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

import { useHorario } from "./horario-context";

/**
 * The sections of Ajustes › Control de horario (redesign FE §3.8). Each reads
 * the page state from `HorarioClient`, checks its own capability and is
 * registered in `lib/shell/settings-sections/horario/*`. Only the team report
 * changes with the presentation style, through `TeamHoursTable`.
 */

/** Default values when a rule checkbox is turned back on. */
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

// ── Control (switch, required date, timeline) ──────────────────────────────

const TIMELINE_CLASS: Record<TimelineSegment["key"], string> = {
  hoy: "flex-[2] bg-muted text-foreground",
  prueba: "flex-[5] bg-secondary text-secondary-foreground",
  obligatorio: "flex-[4] bg-primary text-primary-foreground",
};

export function HorarioControl() {
  const { draft, update, canManage, editable, today } = useHorario();
  const switchId = useId();
  const dateId = useId();
  const stateId = useId();
  if (!canManage) return null;

  const state = enabledStateCopy(draft, today);
  const segments = timelineSegments(today, draft.requiredFrom);

  return (
    <SettingsSection
      title="Control de horario"
      description="Registro de entrada y salida para medir las horas trabajadas del equipo."
    >
      <div className="flex flex-wrap items-center gap-4">
        <Switch
          id={switchId}
          aria-label="Activar control de horario"
          aria-describedby={stateId}
          checked={draft.enabled}
          disabled={!editable}
          onCheckedChange={(checked) => update({ enabled: checked })}
        />
        <div id={stateId} className="flex min-w-[16rem] flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold text-foreground">{state.title}</span>
          <span className="text-sm text-muted-foreground">{state.description}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={dateId}>Obligatorio a partir de</Label>
          <Input
            id={dateId}
            type="date"
            className="w-44"
            value={draft.requiredFrom ?? ""}
            min={minRequiredFrom(today)}
            disabled={!editable || !draft.enabled}
            onChange={(event) => update({ requiredFrom: event.target.value || null })}
          />
        </div>
      </div>

      {draft.enabled ? (
        <div className="flex flex-col gap-2">
          <ol aria-label="Etapas del control de horario" className="flex min-h-9 overflow-hidden rounded-lg text-xs font-medium">
            {segments.map((segment) => (
              <li key={segment.key} className={cn("flex items-center px-3 py-2", TIMELINE_CLASS[segment.key])}>
                {segment.label}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            El reloj de jornada aparece en el menú lateral de todas las pantallas mientras esto esté activado.
          </p>
        </div>
      ) : null}
    </SettingsSection>
  );
}

// ── Reglas de la jornada ───────────────────────────────────────────────────

function RuleCheckbox({
  checked,
  disabled,
  onChange,
  title,
  description,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const checkboxId = useId();
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          className="mt-0.5"
          checked={checked}
          disabled={disabled}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <span className="flex flex-col gap-0.5">
          <Label id={titleId} htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
            {title}
          </Label>
          <span id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </span>
        </span>
      </div>
      {children ? <div className="pl-7">{children}</div> : null}
    </div>
  );
}

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

export function HorarioReglas() {
  const { draft, saved, update, canManage, canViewReport, editable } = useHorario();
  const ids = {
    dayStart: useId(),
    dayEnd: useId(),
    hours: useId(),
    tolerance: useId(),
    toleranceHint: useId(),
    days: useId(),
    autoClose: useId(),
    lunch: useId(),
    roles: useId(),
  };
  if (!canManage && !canViewReport) return null;

  if (!canManage) {
    return (
      <SettingsSection title="Reglas de la jornada" description="Las define un administrador.">
        <ReglasResumen settings={saved} />
      </SettingsSection>
    );
  }

  const disabled = !editable;
  const toggleDay = (day: number) =>
    update({
      workDays: draft.workDays.includes(day)
        ? draft.workDays.filter((d) => d !== day)
        : [...draft.workDays, day].sort((a, b) => a - b),
    });
  const toggleRole = (role: string, checked: boolean) =>
    update({
      exemptRoles: checked
        ? [...new Set([...draft.exemptRoles, role])]
        : draft.exemptRoles.filter((r) => r !== role),
    });

  return (
    <SettingsSection title="Reglas de la jornada">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.dayStart}>Entrada</Label>
          <Input
            id={ids.dayStart}
            type="time"
            value={draft.dayStart}
            disabled={disabled}
            onChange={(event) => update({ dayStart: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.dayEnd}>Salida</Label>
          <Input
            id={ids.dayEnd}
            type="time"
            value={draft.dayEnd}
            disabled={disabled}
            onChange={(event) => update({ dayEnd: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.hours}>Horas esperadas por día</Label>
          <Input
            id={ids.hours}
            type="number"
            inputMode="decimal"
            min={1}
            max={12}
            step={0.5}
            value={draft.hoursPerDay}
            disabled={disabled}
            onChange={(event) => update({ hoursPerDay: numberValue(event.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.tolerance}>Tolerancia de retardo</Label>
          <Input
            id={ids.tolerance}
            type="number"
            inputMode="numeric"
            min={0}
            step={5}
            aria-describedby={ids.toleranceHint}
            value={draft.lateToleranceMin}
            disabled={disabled}
            onChange={(event) => update({ lateToleranceMin: numberValue(event.target.value) })}
          />
          <span id={ids.toleranceHint} className="text-xs text-muted-foreground">
            En minutos.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={ids.days} className="text-sm font-medium text-foreground">
          Días laborales
        </span>
        <div role="group" aria-labelledby={ids.days} className="flex flex-wrap gap-1.5">
          {WORK_DAY_TOGGLES.map((toggle) => {
            const on = draft.workDays.includes(toggle.day);
            return (
              <Button
                key={toggle.day}
                type="button"
                size="icon"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                aria-label={toggle.label}
                disabled={disabled}
                onClick={() => toggleDay(toggle.day)}
              >
                {toggle.letter}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col">
        <RuleCheckbox
          checked={draft.promptAtLogin}
          disabled={disabled}
          onChange={(checked) => update({ promptAtLogin: checked })}
          title="Pedir registro de entrada al iniciar sesión"
          description="Aparece una ventana la primera vez que alguien entra en el día."
        />
        <RuleCheckbox
          checked={draft.autoCloseAt !== null}
          disabled={disabled}
          onChange={(checked) =>
            update({ autoCloseAt: checked ? (saved.autoCloseAt ?? DEFAULT_AUTO_CLOSE_AT) : null })
          }
          title={
            draft.autoCloseAt !== null
              ? `Cerrar la jornada automáticamente a las ${draft.autoCloseAt}`
              : "Cerrar la jornada automáticamente"
          }
          description="Si alguien olvida registrar su salida, se cierra y se marca para revisión."
        >
          {draft.autoCloseAt !== null ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={ids.autoClose}>Hora de cierre</Label>
              <Input
                id={ids.autoClose}
                type="time"
                className="w-32"
                value={draft.autoCloseAt}
                disabled={disabled}
                onChange={(event) => update({ autoCloseAt: event.target.value || null })}
              />
            </div>
          ) : null}
        </RuleCheckbox>
        <RuleCheckbox
          checked={draft.lunchMinutes > 0}
          disabled={disabled}
          onChange={(checked) =>
            update({ lunchMinutes: checked ? (saved.lunchMinutes > 0 ? saved.lunchMinutes : DEFAULT_LUNCH_MINUTES) : 0 })
          }
          title={draft.lunchMinutes > 0 ? `Descontar ${draft.lunchMinutes} min de comida` : "Descontar tiempo de comida"}
          description="Se resta de las horas del día si no se registró una pausa."
        >
          {draft.lunchMinutes > 0 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={ids.lunch}>Minutos de comida</Label>
              <Input
                id={ids.lunch}
                type="number"
                inputMode="numeric"
                className="w-32"
                min={0}
                step={5}
                value={draft.lunchMinutes}
                disabled={disabled}
                onChange={(event) => update({ lunchMinutes: numberValue(event.target.value) })}
              />
            </div>
          ) : null}
        </RuleCheckbox>
        <fieldset className="flex flex-col gap-2 border-t border-border py-3" aria-describedby={ids.roles}>
          <legend className="text-sm font-medium text-foreground">Excluir roles</legend>
          <span id={ids.roles} className="text-xs text-muted-foreground">
            Quienes tienen estos roles no registran horario.
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2">
            {OFFICIAL_CINCEL_ROLES.map((role, index) => (
              <div key={role} className="flex items-center gap-2">
                <Checkbox
                  id={`${ids.roles}-role-${index}`}
                  aria-labelledby={`${ids.roles}-role-${index}-label`}
                  checked={draft.exemptRoles.includes(role)}
                  disabled={disabled}
                  onCheckedChange={(value) => toggleRole(role, value === true)}
                />
                <Label
                  id={`${ids.roles}-role-${index}-label`}
                  htmlFor={`${ids.roles}-role-${index}`}
                  className="cursor-pointer text-sm font-normal text-foreground"
                >
                  {role}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      </div>
    </SettingsSection>
  );
}

// ── Lo que ve el equipo al iniciar sesión ──────────────────────────────────

export function HorarioVistaPrevia() {
  const { draft, canManage, today, viewerName } = useHorario();
  if (!canManage) return null;
  const copy = clockInPromptCopy(viewerName, draft.requiredFrom, today);
  return (
    <SettingsSection title="Lo que ve el equipo al iniciar sesión">
      <figure aria-label="Vista previa de la ventana de registro" className="flex justify-center rounded-xl bg-muted p-4">
        <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl border border-border bg-card p-5 text-center text-card-foreground shadow-sm">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Clock aria-hidden="true" className="size-5" strokeWidth={1.9} />
          </span>
          <span className="text-base font-semibold">{copy.title}</span>
          <span className="text-sm text-muted-foreground">{copy.body}</span>
          <span aria-hidden="true" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            {copy.primary}
          </span>
          {copy.dismiss ? (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              {copy.dismiss}
            </span>
          ) : null}
        </div>
        <figcaption className="sr-only">
          {[copy.title, copy.body, copy.primary, copy.dismiss].filter(Boolean).join(". ")}
        </figcaption>
      </figure>
    </SettingsSection>
  );
}

// ── Horas del equipo ───────────────────────────────────────────────────────

export function HorarioHorasEquipo() {
  const { canViewReport, weekStart, rows, saved } = useHorario();
  const { style } = useStyle();
  if (!canViewReport || !IMPLEMENTED.fetchTeamHoursAction) return null;
  return (
    <SettingsSection
      title={`Horas del equipo · semana del ${formatDayMonth(weekStart)}`}
      actions={
        <a
          href={horarioExportHref(weekStart)}
          download={`horario-${weekStart}.csv`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Exportar CSV
        </a>
      }
    >
      <TeamHoursTable weekStart={weekStart} rows={rows} style={style} requiredFrom={saved.requiredFrom} />
    </SettingsSection>
  );
}

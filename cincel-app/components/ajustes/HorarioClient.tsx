"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { HorarioControl, HorarioHorasEquipo, HorarioReglas, HorarioVistaPrevia } from "@/components/ajustes/HorarioSections";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { saveTimeTrackingSettingsAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { localDate } from "@/lib/time-tracking/local-time";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

import { HorarioContext, type HorarioContextValue } from "./horario-context";

export type HorarioClientProps = {
  settings: TimeTrackingSettings;
  canManage: boolean;
  canViewReport: boolean;
  weekStart: string;
  rows: TeamHoursRow[];
  /** The viewer's first name, for the prompt preview ("Buenos días, {name}"). */
  viewerName?: string;
  /** The visible sections (`settingsSectionsFor("horario", user)`); the default set when omitted. */
  children?: ReactNode;
};

function sameSettings(a: TimeTrackingSettings, b: TimeTrackingSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Ajustes › Control de horario (redesign FE §3.8): settings sections for
 * `canManageTimeTracking`, the team report for `canViewTeamHours`. Viewers
 * with only the report capability (Dirección) get the report and a read-only
 * summary of the rules: no switch, no save. "Guardar cambios" appears only
 * while `saveTimeTrackingSettingsAction` is implemented. Settings ignore the
 * presentation style; only the report changes with it.
 */
export function HorarioClient({
  settings,
  canManage,
  canViewReport,
  weekStart,
  rows,
  viewerName = "",
  children,
}: HorarioClientProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<TimeTrackingSettings>(settings);
  const [draft, setDraft] = useState<TimeTrackingSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => localDate(new Date()));

  const editable = canManage && IMPLEMENTED.saveTimeTrackingSettingsAction;
  const dirty = !sameSettings(saved, draft);

  const value = useMemo<HorarioContextValue>(
    () => ({
      saved,
      draft: editable ? draft : saved,
      update: (patch) => {
        setError(null);
        setDraft((current) => ({ ...current, ...patch }));
      },
      canManage,
      canViewReport,
      editable,
      weekStart,
      rows,
      today,
      viewerName,
    }),
    [saved, draft, editable, canManage, canViewReport, weekStart, rows, today, viewerName],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveTimeTrackingSettingsAction(draft);
      setSaved(next);
      setDraft(next);
      toast.success("Cambios guardados");
      router.refresh();
    } catch (err) {
      setError(actionErrorText(err));
    } finally {
      setSaving(false);
    }
  }

  const sections = children ?? (
    <>
      <HorarioControl />
      <HorarioReglas />
      <HorarioVistaPrevia />
      <HorarioHorasEquipo />
    </>
  );

  return (
    <HorarioContext.Provider value={value}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {sections}
        {editable ? (
          <div className="flex flex-col gap-3">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={saving || !dirty}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </HorarioContext.Provider>
  );
}

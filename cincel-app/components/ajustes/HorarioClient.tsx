"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { AdminPageHeading } from "@/components/ajustes/AdminFields";
import { HorarioControl, HorarioHorasEquipo, HorarioReglas, HorarioVistaPrevia } from "@/components/ajustes/HorarioSections";
import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import { saveTimeTrackingSettingsAction } from "@/lib/actions/time-tracking-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesHorarioOptions, type AjustesHorarioPageData } from "@/lib/query/options/ajustes";
import { HorarioFormStoreProvider, useHorarioForm, useHorarioFormApi } from "@/lib/stores/ajustes/horario-form-store";
import { localDate } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

import { useHorario } from "./horario-context";

export type HorarioClientProps = {
  /** The Monday the report opens on; the page hydrated `qk.ajustes.page('horario', { weekStart })`. */
  weekStart: string;
  /** The viewer's first name, for the prompt preview ("Buenos días, {name}"). */
  viewerName?: string;
  /** The visible sections (`settingsSectionsFor("horario", user)`); the default set when omitted. */
  children?: ReactNode;
};

export const HORARIO_SAVE_NOTE = "Los cambios se aplican desde mañana.";

/** How many settings differ between the saved value and the draft (the save bar's count). */
export function changedSettingsCount(saved: TimeTrackingSettings, draft: TimeTrackingSettings): number {
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]) as Set<keyof TimeTrackingSettings>;
  let count = 0;
  for (const key of keys) {
    if (JSON.stringify(saved[key] ?? null) !== JSON.stringify(draft[key] ?? null)) count += 1;
  }
  return count;
}

/**
 * Ajustes › Control de horario (canvas `Ajustes-Horario`): admin heading,
 * then the sections (Control, Reglas de la jornada, Lo que ve el equipo al
 * iniciar sesión, Horas del equipo) and the save bar ("Los cambios se aplican
 * desde mañana." · Descartar · Guardar cambios). Settings sections for
 * `canManageTimeTracking`, the team report for `canViewTeamHours`. Viewers
 * with only the report capability (Dirección) get the report and a read-only
 * summary of the rules: no switch, no save. Settings ignore the presentation
 * style; only the report widget changes with it.
 *
 * The saved settings and the report are `qk.ajustes.page('horario', {
 * weekStart })`, hydrated by the page; the draft and the shown week live in a
 * page-scoped store that resets on unmount.
 */
export function HorarioClient({ weekStart, viewerName = "", children }: HorarioClientProps) {
  const { data } = useSuspenseQuery(ajustesHorarioOptions(weekStart));
  const [today] = useState(() => localDate(new Date()));
  return (
    <HorarioFormStoreProvider initial={{ draft: data.settings, weekStart, today, viewerName }}>
      <HorarioForm>{children}</HorarioForm>
    </HorarioFormStoreProvider>
  );
}

function HorarioForm({ children }: { children?: ReactNode }) {
  const { saved, draft, editable } = useHorario();
  const form = useHorarioFormApi();
  const error = useHorarioForm((s) => s.errors.form ?? null);
  const dirtyCount = editable ? changedSettingsCount(saved, draft) : 0;

  // Saving keeps the root layout revalidation (the TimeClock gate is server-rendered).
  const save = useActionMutation(saveTimeTrackingSettingsAction, {
    setData: (qc, next) => {
      qc.setQueriesData<AjustesHorarioPageData>({ queryKey: qk.ajustes.page("horario") }, (page) =>
        page ? { ...page, settings: next } : page,
      );
      form.getState().replace(next);
    },
    invalidate: [qk.ajustes.page("horario"), qk.me.today()],
    onFormError: (text) => form.getState().setError("form", text),
    successToast: "Cambios guardados",
  });

  function submit() {
    if (!editable || save.isPending) return;
    form.getState().setError("form", null);
    save.mutate(draft);
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
    <div className="flex flex-col gap-4">
      <AdminPageHeading
        title="Control de horario"
        description="Registro de entrada y salida para medir las horas trabajadas del equipo."
      />
      {sections}
      {editable ? (
        <SettingsSaveBar
          dirtyCount={dirtyCount}
          saving={save.isPending}
          onDiscard={() => form.getState().replace(saved)}
          onSave={submit}
          saveLabel="Guardar cambios"
          status={HORARIO_SAVE_NOTE}
          error={error}
        />
      ) : null}
    </div>
  );
}

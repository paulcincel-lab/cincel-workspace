"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { HorarioControl, HorarioHorasEquipo, HorarioReglas, HorarioVistaPrevia } from "@/components/ajustes/HorarioSections";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
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
  const dirty = !sameSettings(saved, draft);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            <Button type="submit" size="lg" disabled={save.isPending || !dirty}>
              {save.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

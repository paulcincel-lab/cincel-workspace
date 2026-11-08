"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import { updateNotificationPreferencesAction } from "@/lib/actions/notifications-actions";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesNotificacionesOptions, type AjustesNotificacionesPageData } from "@/lib/query/options/ajustes";
import {
  NOTIFICATION_MATRIX_CHANNELS,
  NOTIFICATION_MATRIX_KINDS,
  NotificacionesFormStoreProvider,
  notificacionesInput,
  useNotificacionesForm,
  useNotificacionesFormApi,
  type NotificationChannel,
} from "@/lib/stores/ajustes/notificaciones-form-store";
import type { NotificationKind } from "@/lib/types/redesign";
import { NotificationPreferencesSchema } from "@/lib/validation/redesign";

/** Matrix rows in order, with their labels (FE §3.8). */
export const NOTIFICATION_KIND_LABELS: Readonly<Record<NotificationKind, string>> = {
  asignacion: "Asignación",
  mencion: "Mención",
  vencimiento: "Vencimiento",
  comentario: "Comentario",
  aprobacion_cliente: "Aprobación del cliente",
  recordatorio: "Recordatorio",
  sistema: "Sistema",
};

type Channel = NotificationChannel;

/** Matrix columns (FE §3.8). There is no Cutto column (RD-9). */
export const NOTIFICATION_CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  inApp: "En la app",
  email: "Correo",
  digest: "Resumen diario",
};

const KINDS = NOTIFICATION_MATRIX_KINDS;
const CHANNELS = NOTIFICATION_MATRIX_CHANNELS;

/** Fixed digest time (R3-1). */
export const DIGEST_NOTE = "Resumen diario a las 07:30";

export type NotificacionesClientProps = {
  /** The page's visible settings sections (`settingsSectionsFor("notificaciones")`); defaults to both. */
  children?: ReactNode;
};

/**
 * Ajustes › Notificaciones (redesign FE §3.8): kind × channel matrix and
 * quiet hours. The saved preferences are the hydrated
 * `qk.ajustes.page('notificaciones')`; the draft the two settings sections
 * edit lives in a page-scoped store (reset when the page unmounts) and
 * "Guardar" saves it through a mutation. Ignores the presentation style.
 */
export function NotificacionesClient({ children }: NotificacionesClientProps) {
  const { preferences } = useSuspenseQuery(ajustesNotificacionesOptions()).data;
  return (
    <NotificacionesFormStoreProvider initial={preferences}>
      <NotificacionesForm>{children}</NotificacionesForm>
    </NotificacionesFormStoreProvider>
  );
}

function NotificacionesForm({ children }: { children?: ReactNode }) {
  const form = useNotificacionesFormApi();
  const formError = useNotificacionesForm((s) => s.formError);
  const pending = useNotificacionesForm((s) => s.pending);

  const save = useActionMutation(updateNotificationPreferencesAction, {
    // The action answers one row per kind (defaults filled), the shape the page data holds.
    setData: (qc, saved) =>
      qc.setQueryData<AjustesNotificacionesPageData>(qk.ajustes.page("notificaciones"), { preferences: saved }),
    invalidate: [qk.me.notificationPrefs(), qk.me.preferences()],
    successToast: "Notificaciones guardadas",
    onFormError: (text) => form.getState().setFormError(text),
  });

  function submit() {
    const state = form.getState();
    state.setTimeError(null);
    state.setFormError(null);
    const input = notificacionesInput(state);
    if (!NotificationPreferencesSchema.safeParse(input).success) {
      state.setTimeError(actionErrorText(new Error("INVALID")));
      return;
    }
    state.setPending(true);
    save.mutate(input, {
      onSuccess: (saved) => form.getState().replace(saved),
      onError: (err) => {
        // An invalid quiet-hours range shows under the times, not as the form error.
        const aboutTimes =
          input.quietHours !== null && actionErrorCode(err) === "INVALID" && err.message.includes("quietHours");
        if (aboutTimes) {
          form.getState().setFormError(null);
          form.getState().setTimeError(actionErrorText(err));
        }
      },
      onSettled: () => form.getState().setPending(false),
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {children ?? (
        <>
          <NotificacionesCanales />
          <NotificacionesHorasSilencio />
        </>
      )}
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

/** Section "Qué te avisamos y por dónde": the kind × channel matrix. Renders inside `NotificacionesClient`. */
export function NotificacionesCanales() {
  const matrix = useNotificacionesForm((s) => s.matrix);
  const pending = useNotificacionesForm((s) => s.pending);
  const setChannel = useNotificacionesForm((s) => s.setChannel);
  return (
    <SettingsSection title="Qué te avisamos y por dónde" description="Marca los canales para cada evento.">
      <Table>
        <caption className="sr-only">Canales por tipo de aviso</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Evento</TableHead>
            {CHANNELS.map((channel) => (
              <TableHead key={channel} scope="col" className="text-center">
                {NOTIFICATION_CHANNEL_LABELS[channel]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {KINDS.map((kind) => (
            <TableRow key={kind}>
              <TableHead scope="row" className="font-normal">
                {NOTIFICATION_KIND_LABELS[kind]}
              </TableHead>
              {CHANNELS.map((channel) => (
                <TableCell key={channel} className="text-center">
                  <Checkbox
                    aria-label={`${NOTIFICATION_KIND_LABELS[kind]} por ${NOTIFICATION_CHANNEL_LABELS[channel]}`}
                    checked={matrix[kind][channel]}
                    disabled={pending}
                    onCheckedChange={(checked) => setChannel(kind, channel, checked === true)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsSection>
  );
}

/** Section "Horario silencioso" plus the fixed daily digest note. Renders inside `NotificacionesClient`. */
export function NotificacionesHorasSilencio() {
  const form = {
    quietEnabled: useNotificacionesForm((s) => s.quietEnabled),
    quietFrom: useNotificacionesForm((s) => s.quietFrom),
    quietTo: useNotificacionesForm((s) => s.quietTo),
    timeError: useNotificacionesForm((s) => s.timeError),
    pending: useNotificacionesForm((s) => s.pending),
    setQuietEnabled: useNotificacionesForm((s) => s.setQuietEnabled),
    setQuietFrom: useNotificacionesForm((s) => s.setQuietFrom),
    setQuietTo: useNotificacionesForm((s) => s.setQuietTo),
  };
  const baseId = useId();
  const switchId = `${baseId}-quiet`;
  const fromId = `${baseId}-from`;
  const toId = `${baseId}-to`;
  const errorId = `${baseId}-error`;
  const timesDisabled = !form.quietEnabled || form.pending;
  const invalid = form.timeError ? true : undefined;
  const describedBy = form.timeError ? errorId : undefined;
  return (
    <SettingsSection
      title="Horario silencioso"
      description="En este horario no te enviamos correos; los avisos llegan al terminar."
    >
      <SettingsRow
        label="No enviar avisos fuera de horario"
        htmlFor={switchId}
        control={
          <Switch
            id={switchId}
            aria-label="No enviar avisos fuera de horario"
            checked={form.quietEnabled}
            disabled={form.pending}
            onCheckedChange={(checked) => form.setQuietEnabled(checked === true)}
          />
        }
      />
      <SettingsRow
        label="Desde"
        htmlFor={fromId}
        control={
          <Input
            id={fromId}
            type="time"
            aria-label="Desde"
            value={form.quietFrom}
            disabled={timesDisabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => form.setQuietFrom(event.target.value)}
          />
        }
      />
      <SettingsRow
        label="Hasta"
        htmlFor={toId}
        control={
          <Input
            id={toId}
            type="time"
            aria-label="Hasta"
            value={form.quietTo}
            disabled={timesDisabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => form.setQuietTo(event.target.value)}
          />
        }
      />
      {form.timeError ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {form.timeError}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{DIGEST_NOTE}</p>
    </SettingsSection>
  );
}

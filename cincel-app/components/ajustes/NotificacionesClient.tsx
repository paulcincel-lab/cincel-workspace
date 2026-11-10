"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { MailIcon } from "lucide-react";
import { useId, useMemo, useRef, type ReactNode } from "react";

import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Badge } from "@/components/ui/shadcn/badge";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
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
  toNotificacionesDraft,
  useNotificacionesForm,
  useNotificacionesFormApi,
  type NotificacionesDraft,
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

/** One-line description under each event (canvas `Ajustes-Notificaciones`). */
export const NOTIFICATION_KIND_DESCRIPTIONS: Readonly<Record<NotificationKind, string>> = {
  asignacion: "Te asignan una tarea o subtarea",
  mencion: "Alguien te menciona en una nota o comentario",
  vencimiento: "Una tarea tuya vence hoy o ya venció",
  comentario: "Comentan en una tarea que sigues",
  aprobacion_cliente: "El cliente aprueba o rechaza desde el portal",
  recordatorio: "Recordatorios que creaste en Mi espacio",
  sistema: "Importaciones, accesos y avisos del despacho",
};

/** Matrix columns (FE §3.8). There is no Cutto column (RD-9). */
export const NOTIFICATION_CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  inApp: "En la app",
  email: "Correo",
  digest: "Resumen diario",
};

const KINDS = NOTIFICATION_MATRIX_KINDS;
const CHANNELS = NOTIFICATION_MATRIX_CHANNELS;

/** Fixed digest time (R3-1). */
export const DIGEST_NOTE = "Resumen diario a las 07:30 con los eventos marcados en la columna «Resumen diario».";
export const DIGEST_BADGE = "07:30 · lun a vie";

/** Accessible name of a matrix switch: "Mención en la app", "Mención por correo", "Mención en el resumen diario". */
export function channelSwitchLabel(kind: NotificationKind, channel: Channel): string {
  const event = NOTIFICATION_KIND_LABELS[kind];
  if (channel === "inApp") return `${event} en la app`;
  if (channel === "email") return `${event} por correo`;
  return `${event} en el resumen diario`;
}

/** Changed fields between the draft and the saved preferences (each cell, the switch and each time). */
export function notificacionesDirtyCount(draft: NotificacionesDraft, saved: NotificacionesDraft): number {
  let count = 0;
  for (const kind of KINDS) {
    for (const channel of CHANNELS) {
      if (draft.matrix[kind][channel] !== saved.matrix[kind][channel]) count += 1;
    }
  }
  if (draft.quietEnabled !== saved.quietEnabled) count += 1;
  if (draft.quietEnabled) {
    if (draft.quietFrom !== saved.quietFrom) count += 1;
    if (draft.quietTo !== saved.quietTo) count += 1;
  }
  return count;
}

export type NotificacionesClientProps = {
  /** The page's visible settings sections (`settingsSectionsFor("notificaciones")`); defaults to all three. */
  children?: ReactNode;
};

/**
 * Ajustes › Notificaciones (redesign FE §3.8, canvas `Ajustes-Notificaciones`):
 * kind × channel matrix, quiet hours and the daily digest note, then the save
 * bar. The saved preferences are the hydrated `qk.ajustes.page('notificaciones')`;
 * the draft the sections edit lives in a page-scoped store (reset when the
 * page unmounts), "Guardar" saves it through a mutation and "Descartar" goes
 * back to the saved values. Ignores the presentation style.
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
  const { preferences } = useSuspenseQuery(ajustesNotificacionesOptions()).data;
  const formError = useNotificacionesForm((s) => s.formError);
  const pending = useNotificacionesForm((s) => s.pending);
  const matrix = useNotificacionesForm((s) => s.matrix);
  const quietEnabled = useNotificacionesForm((s) => s.quietEnabled);
  const quietFrom = useNotificacionesForm((s) => s.quietFrom);
  const quietTo = useNotificacionesForm((s) => s.quietTo);
  const saved = useMemo(() => toNotificacionesDraft(preferences), [preferences]);
  const dirtyCount = notificacionesDirtyCount({ matrix, quietEnabled, quietFrom, quietTo }, saved);
  const formRef = useRef<HTMLFormElement>(null);

  /** After a validation error renders, focus moves to the first invalid field. */
  function focusFirstInvalid() {
    setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
  }

  const save = useActionMutation(updateNotificationPreferencesAction, {
    // The action answers one row per kind (defaults filled), the shape the page data holds.
    setData: (qc, saved) =>
      qc.setQueryData<AjustesNotificacionesPageData>(qk.ajustes.page("notificaciones"), { preferences: saved }),
    invalidate: [qk.me.notificationPrefs(), qk.me.preferences()],
    successToast: "Cambios guardados",
    onFormError: (text) => form.getState().setFormError(text),
  });

  function submit() {
    const state = form.getState();
    state.setTimeError(null);
    state.setFormError(null);
    const input = notificacionesInput(state);
    if (!NotificationPreferencesSchema.safeParse(input).success) {
      state.setTimeError(actionErrorText(new Error("INVALID")));
      focusFirstInvalid();
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
          focusFirstInvalid();
        }
      },
      onSettled: () => form.getState().setPending(false),
    });
  }

  return (
    <form
      ref={formRef}
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
          <NotificacionesResumenDiario />
        </>
      )}
      <SettingsSaveBar
        dirtyCount={dirtyCount}
        saving={pending}
        error={formError}
        onDiscard={() => form.getState().reset()}
        onSave={submit}
      />
    </form>
  );
}

/** Section "Qué te avisamos y por dónde": the kind × channel matrix of switches. Renders inside `NotificacionesClient`. */
export function NotificacionesCanales() {
  const matrix = useNotificacionesForm((s) => s.matrix);
  const pending = useNotificacionesForm((s) => s.pending);
  const setChannel = useNotificacionesForm((s) => s.setChannel);
  return (
    <SettingsSection title="Qué te avisamos y por dónde" description="Marca los canales para cada evento.">
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <Table>
          <caption className="sr-only">Canales por tipo de aviso</caption>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead scope="col" className={TABLE_HEAD_CLASS}>
                Evento
              </TableHead>
              {CHANNELS.map((channel) => (
                <TableHead key={channel} scope="col" className={`${TABLE_HEAD_CLASS} text-center`}>
                  {NOTIFICATION_CHANNEL_LABELS[channel]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {KINDS.map((kind) => (
              <TableRow key={kind} className="border-accent">
                <TableHead scope="row" className="px-3.5 py-2.5 align-top font-normal whitespace-normal">
                  <span className="block text-[13.5px] font-medium text-foreground">{NOTIFICATION_KIND_LABELS[kind]}</span>
                  <span className="block text-xs text-muted-foreground">{NOTIFICATION_KIND_DESCRIPTIONS[kind]}</span>
                </TableHead>
                {CHANNELS.map((channel) => (
                  <TableCell key={channel} className="px-3.5 py-2.5 text-center">
                    <Switch
                      aria-label={channelSwitchLabel(kind, channel)}
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
      </div>
    </SettingsSection>
  );
}

/** Table header cells: Geist Mono 11 px / 500, tracking .08em, uppercase, `--muted-foreground`. */
const TABLE_HEAD_CLASS = "px-3.5 py-2.5 font-mono text-[11px] font-medium tracking-[.08em] text-muted-foreground uppercase";

/** Section "Horario silencioso": the switch and the two times. Renders inside `NotificacionesClient`. */
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor={switchId} className="text-[13px] font-medium text-foreground">
          No enviar avisos fuera de horario
        </Label>
        <Switch
          id={switchId}
          aria-label="No enviar avisos fuera de horario"
          checked={form.quietEnabled}
          disabled={form.pending}
          onCheckedChange={(checked) => form.setQuietEnabled(checked === true)}
        />
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fromId} className="text-[13px] font-medium text-foreground">
            Desde
          </Label>
          <Input
            id={fromId}
            type="time"
            className="font-mono"
            value={form.quietFrom}
            disabled={timesDisabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => form.setQuietFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={toId} className="text-[13px] font-medium text-foreground">
            Hasta
          </Label>
          <Input
            id={toId}
            type="time"
            className="font-mono"
            value={form.quietTo}
            disabled={timesDisabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => form.setQuietTo(event.target.value)}
          />
        </div>
      </div>
      {form.timeError ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {form.timeError}
        </p>
      ) : null}
    </SettingsSection>
  );
}

/** Info section "Resumen diario": the fixed 07:30 digest (R3-1). */
export function NotificacionesResumenDiario() {
  return (
    <SettingsSection
      title="Resumen diario"
      description={DIGEST_NOTE}
      icon={
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground"
        >
          <MailIcon className="size-5" />
        </span>
      }
      actions={
        <Badge variant="outline" className="font-mono">
          {DIGEST_BADGE}
        </Badge>
      }
    />
  );
}

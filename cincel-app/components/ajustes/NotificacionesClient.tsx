"use client";

import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

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
import type { NotificationKind, NotificationPreferences } from "@/lib/types/redesign";
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

type Channel = "inApp" | "email" | "digest";

/** Matrix columns (FE §3.8). There is no Cutto column (RD-9). */
export const NOTIFICATION_CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  inApp: "En la app",
  email: "Correo",
  digest: "Resumen diario",
};

const KINDS = Object.keys(NOTIFICATION_KIND_LABELS) as NotificationKind[];
const CHANNELS = Object.keys(NOTIFICATION_CHANNEL_LABELS) as Channel[];

/** Fixed digest time (R3-1). */
export const DIGEST_NOTE = "Resumen diario a las 07:30";

const DEFAULT_QUIET_FROM = "20:00";
const DEFAULT_QUIET_TO = "08:00";

type ChannelValues = Record<Channel, boolean>;
type Matrix = Record<NotificationKind, ChannelValues>;

function toMatrix(prefs: NotificationPreferences): Matrix {
  const byKind = new Map(prefs.rows.map((row) => [row.kind, row]));
  return Object.fromEntries(
    KINDS.map((kind) => {
      const row = byKind.get(kind);
      return [kind, { inApp: row?.inApp ?? false, email: row?.email ?? false, digest: row?.digest ?? false }];
    }),
  ) as Matrix;
}

type FormContextValue = {
  matrix: Matrix;
  setChannel(kind: NotificationKind, channel: Channel, value: boolean): void;
  quietEnabled: boolean;
  setQuietEnabled(value: boolean): void;
  quietFrom: string;
  setQuietFrom(value: string): void;
  quietTo: string;
  setQuietTo(value: string): void;
  timeError: string | null;
  pending: boolean;
};

const NotificacionesFormContext = createContext<FormContextValue | null>(null);

export type NotificacionesClientProps = {
  /** One row per kind with defaults filled (`withNotificationDefaults`). */
  initial: NotificationPreferences;
  /** The page's visible settings sections (`settingsSectionsFor("notificaciones")`); defaults to both. */
  children?: ReactNode;
};

/**
 * Ajustes › Notificaciones (redesign FE §3.8): kind × channel matrix and
 * quiet hours. Holds the form state the two settings sections edit and saves
 * it with "Guardar". Ignores the presentation style.
 */
export function NotificacionesClient({ initial, children }: NotificacionesClientProps) {
  const [matrix, setMatrix] = useState<Matrix>(() => toMatrix(initial));
  const [quietEnabled, setQuietEnabledState] = useState(initial.quietHours !== null);
  const [quietFrom, setQuietFromState] = useState(initial.quietHours?.from ?? DEFAULT_QUIET_FROM);
  const [quietTo, setQuietToState] = useState(initial.quietHours?.to ?? DEFAULT_QUIET_TO);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clearErrors() {
    setTimeError(null);
    setFormError(null);
  }

  const value: FormContextValue = {
    matrix,
    setChannel(kind, channel, checked) {
      setFormError(null);
      setMatrix((prev) => ({ ...prev, [kind]: { ...prev[kind], [channel]: checked } }));
    },
    quietEnabled,
    setQuietEnabled(checked) {
      clearErrors();
      setQuietEnabledState(checked);
    },
    quietFrom,
    setQuietFrom(v) {
      clearErrors();
      setQuietFromState(v);
    },
    quietTo,
    setQuietTo(v) {
      clearErrors();
      setQuietToState(v);
    },
    timeError,
    pending,
  };

  function save() {
    clearErrors();
    const input: NotificationPreferences = {
      rows: KINDS.map((kind) => ({ kind, ...matrix[kind] })),
      quietHours: quietEnabled ? { from: quietFrom, to: quietTo } : null,
    };
    const parsed = NotificationPreferencesSchema.safeParse(input);
    if (!parsed.success) {
      setTimeError(actionErrorText(new Error("INVALID")));
      return;
    }
    startTransition(async () => {
      try {
        const saved = await updateNotificationPreferencesAction(input);
        setMatrix(toMatrix(saved));
        setQuietEnabledState(saved.quietHours !== null);
        if (saved.quietHours) {
          setQuietFromState(saved.quietHours.from);
          setQuietToState(saved.quietHours.to);
        }
        toast.success("Notificaciones guardadas");
      } catch (err) {
        const text = actionErrorText(err);
        const aboutTimes =
          quietEnabled && actionErrorCode(err) === "INVALID" && err instanceof Error && err.message.includes("quietHours");
        if (aboutTimes) setTimeError(text);
        else setFormError(text);
      }
    });
  }

  return (
    <NotificacionesFormContext.Provider value={value}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
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
    </NotificacionesFormContext.Provider>
  );
}

/** Section "Qué te avisamos y por dónde": the kind × channel matrix. Renders inside `NotificacionesClient`. */
export function NotificacionesCanales() {
  const form = useContext(NotificacionesFormContext);
  if (!form) return null;
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
                    checked={form.matrix[kind][channel]}
                    disabled={form.pending}
                    onCheckedChange={(checked) => form.setChannel(kind, channel, checked === true)}
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
  const form = useContext(NotificacionesFormContext);
  const baseId = useId();
  if (!form) return null;
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

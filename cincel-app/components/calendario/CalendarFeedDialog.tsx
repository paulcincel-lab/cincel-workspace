"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  disableCalendarFeedAction,
  disableGoogleCalendarSyncAction,
  enableGoogleCalendarSyncAction,
  generateCalendarFeedAction,
  syncGoogleCalendarAction,
  type GoogleCalendarSyncOutcome,
} from "@/lib/actions/calendar-actions";
import { useActionMutation } from "@/lib/query/mutation";
import {
  CALENDAR_INTEGRATION_INVALIDATE,
  calendarFeedStatusOptions,
  googleCalendarSyncStatusOptions,
} from "@/lib/query/options/calendar";

type Props = { open: boolean; onClose: () => void };

/** One Google Calendar sync step: an `{ ok: false }` outcome is shown inline with its own message. */
type SyncStep = { action: () => Promise<GoogleCalendarSyncOutcome | null | void> };

function formatSyncedAt(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const GOOGLE_CALENDAR_SYNC_NOTE =
  "Tus tareas con fecha se copian al calendario «Cincel» en tu Google Calendar. Si dejas de sincronizar, el calendario se queda en Google; puedes borrarlo ahí.";

/** Where "Conectar Google Calendar" sends the browser: the incremental staff consent (FE §2.7). */
export const CALENDAR_CONNECT_URL = "/api/auth/google/start?scope=calendar&return_to=/calendario";

/**
 * Direct sync (#434): once the staff member grants the Calendar consent, tasks are pushed into a "Cincel" calendar the app creates there —
 * updates land within minutes instead of Google's hours-long ICS polling.
 */
export function GoogleCalendarSyncSection({ open }: { open: boolean }) {
  const statusQuery = useQuery({ ...googleCalendarSyncStatusOptions(), enabled: open });
  const status = statusQuery.data ?? null;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const mutation = useActionMutation<SyncStep, { failed: string | null }>(
    async ({ action }) => {
      const outcome = await action();
      return { failed: outcome && !outcome.ok ? (outcome.error ?? "No se pudo sincronizar.") : null };
    },
    {
      invalidate: CALENDAR_INTEGRATION_INVALIDATE,
      onFormError: () => setError("No se pudo sincronizar."),
    },
  );
  const busy = mutation.isPending;

  function run(action: SyncStep["action"], done: string) {
    setError("");
    setMessage("");
    mutation.mutate(
      { action },
      {
        onSuccess: ({ failed }) => {
          if (failed) setError(failed);
          else setMessage(done);
        },
      },
    );
  }

  const shownError = error || (statusQuery.isError ? "No se pudo consultar la sincronización." : "");

  function connect() {
    window.location.href = CALENDAR_CONNECT_URL;
  }

  if (!status?.oauthAvailable) return null;

  return (
    <section className="space-y-3 text-sm" aria-label="Sincronización directa">
      <h3 className="font-medium">Sincronización directa</h3>
      {!status.hasCalendarScope ? (
        <>
          <p className="text-muted-foreground">
            Da permiso a Google Calendar y crearemos un calendario «Cincel» con tus tareas. Solo podemos ver y editar ese
            calendario, nunca el resto de tu agenda.
          </p>
          <Button onClick={connect}>Conectar Google Calendar</Button>
        </>
      ) : !status.enabled ? (
        <>
          <p className="text-muted-foreground">
            Cuenta conectada: <span className="text-foreground">{status.connectedEmail}</span>. Activa la
            sincronización para crear el calendario «Cincel».
          </p>
          <Button disabled={busy} onClick={() => run(enableGoogleCalendarSyncAction, "Sincronización activada.")}>
            Activar sincronización
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Activa</Badge>
            <span className="text-[12.5px] text-muted-foreground">
              <span className="text-foreground">{status.connectedEmail}</span>
              {status.lastSyncedAt ? (
                <span className="font-mono"> · Última sincronización: {formatSyncedAt(status.lastSyncedAt)}</span>
              ) : null}
            </span>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{GOOGLE_CALENDAR_SYNC_NOTE}</p>
          {status.lastError && !shownError && !message ? (
            <p className="text-destructive">Último error: {status.lastError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => syncGoogleCalendarAction(), "Calendario actualizado.")}>
              {busy ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("¿Dejar de sincronizar? El calendario «Cincel» se queda en Google; puedes borrarlo ahí.")) return;
                run(disableGoogleCalendarSyncAction, "Sincronización desactivada.");
              }}
            >
              Dejar de sincronizar
            </Button>
            {shownError || status.lastError ? (
              <Button variant="ghost" disabled={busy} onClick={connect}>
                Reconectar Google Calendar
              </Button>
            ) : null}
          </div>
        </>
      )}
      {message ? <p className="text-muted-foreground">{message}</p> : null}
      {shownError ? <p className="text-destructive">{shownError}</p> : null}
    </section>
  );
}

export const FEED_REGENERATE_TITLE = "¿Regenerar el enlace? El enlace anterior deja de funcionar.";
export const FEED_DISABLE_TITLE = "¿Desactivar el enlace? Las apps suscritas dejan de recibir tus tareas.";

/**
 * "Enlace de suscripción" rendered inline (Ajustes › Gmail, calendario y
 * Cutto): the private ICS link for Apple Calendar, Outlook or any other app.
 * The token is shown once, right after it is generated (only its hash is
 * stored), so the read-only field is empty for an existing link until it is
 * regenerated. "Copiar" copies it (toast "Enlace copiado"), "Regenerar" asks
 * first (the old link stops working) and "Desactivar" turns it off.
 */
export function CalendarFeedLinkSection({ open = true }: { open?: boolean }) {
  const statusQuery = useQuery({ ...calendarFeedStatusOptions(), enabled: open });
  const enabled = statusQuery.data?.enabled ?? null;
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"regenerate" | "disable" | null>(null);
  const [error, setError] = useState("");
  const inputId = useId();
  const titleId = useId();

  const setFeedEnabled = (qc: QueryClient, value: boolean) =>
    qc.setQueryData(calendarFeedStatusOptions().queryKey, { enabled: value });

  const generateMutation = useActionMutation<void, { token: string }>(() => generateCalendarFeedAction(), {
    invalidate: CALENDAR_INTEGRATION_INVALIDATE,
    setData: (qc) => setFeedEnabled(qc, true),
    onFormError: () => setError("No se pudo generar el enlace."),
  });
  const disableMutation = useActionMutation<void, void>(() => disableCalendarFeedAction(), {
    invalidate: CALENDAR_INTEGRATION_INVALIDATE,
    setData: (qc) => setFeedEnabled(qc, false),
    onFormError: () => setError("No se pudo desactivar el enlace."),
  });
  const busy = generateMutation.isPending || disableMutation.isPending;

  function generate() {
    setError("");
    generateMutation.mutate(undefined, {
      onSuccess: ({ token }) => setFeedUrl(`${window.location.origin}/api/calendario/feed/${token}.ics`),
    });
  }

  function disable() {
    setError("");
    disableMutation.mutate(undefined, { onSuccess: () => setFeedUrl(null) });
  }

  async function copy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("Enlace copiado");
    } catch {
      setError("No se pudo copiar el enlace. Selecciónalo y cópialo a mano.");
    }
  }

  const shownError = error || (statusQuery.isError ? "No se pudo consultar el estado del enlace." : "");

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-border pt-3.5 text-sm">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-[13.5px] font-semibold text-foreground">
          Enlace de suscripción
        </h3>
        <p className="text-[12.5px] text-muted-foreground">Para Apple Calendar, Outlook u otra app.</p>
      </div>
      {enabled ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[13px] font-medium text-foreground">
              Enlace del calendario
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={inputId}
                readOnly
                value={feedUrl ?? ""}
                placeholder="Regenera el enlace para verlo de nuevo"
                className="min-w-0 flex-1 bg-muted font-mono text-sidebar-foreground"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button disabled={busy || !feedUrl} onClick={() => void copy()}>
                <CopyIcon aria-hidden="true" data-icon="inline-start" />
                Copiar
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirm("regenerate")}>
                Regenerar
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirm("disable")}>
                Desactivar
              </Button>
            </div>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {feedUrl
              ? "Cópialo ahora: por seguridad no se vuelve a mostrar. Cualquiera con el enlace puede ver tus tareas."
              : "Ya tienes un enlace activo. Si lo perdiste, regenera uno nuevo; el anterior deja de funcionar."}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted-foreground">Aún no has creado un enlace.</p>
          <Button disabled={busy || enabled === null} onClick={generate}>
            Crear enlace
          </Button>
        </div>
      )}
      {shownError ? (
        <p role="alert" className="text-destructive">
          {shownError}
        </p>
      ) : null}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "disable" ? FEED_DISABLE_TITLE : FEED_REGENERATE_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "disable"
                ? "Puedes crear uno nuevo cuando quieras."
                : "Tendrás que pegar el nuevo enlace en las apps donde lo usabas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "disable" ? "destructive" : "default"}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "disable") disable();
                else generate();
              }}
            >
              {confirm === "disable" ? "Desactivar" : "Regenerar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * Subscribe Google Calendar (or any calendar app) to the user's tasks through
 * a private ICS link. The URL contains a secret token that is only shown
 * right after it's generated — only its hash is stored — so "Regenerar"
 * is how you get a new one (and it invalidates the old link).
 */
export default function CalendarFeedDialog({ open, onClose }: Props) {
  const statusQuery = useQuery({ ...calendarFeedStatusOptions(), enabled: open });
  const enabled = statusQuery.data?.enabled ?? null;
  // The token is shown once, right after it's generated; it is never stored in the cache.
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const setFeedEnabled = (qc: QueryClient, value: boolean) =>
    qc.setQueryData(calendarFeedStatusOptions().queryKey, { enabled: value });

  const generateMutation = useActionMutation<void, { token: string }>(() => generateCalendarFeedAction(), {
    invalidate: CALENDAR_INTEGRATION_INVALIDATE,
    setData: (qc) => setFeedEnabled(qc, true),
    onFormError: () => setError("No se pudo generar el enlace."),
  });
  const disableMutation = useActionMutation<void, void>(() => disableCalendarFeedAction(), {
    invalidate: CALENDAR_INTEGRATION_INVALIDATE,
    setData: (qc) => setFeedEnabled(qc, false),
    onFormError: () => setError("No se pudo desactivar el enlace."),
  });
  const busy = generateMutation.isPending || disableMutation.isPending;

  function generate() {
    setError("");
    generateMutation.mutate(undefined, {
      onSuccess: ({ token }) => {
        setFeedUrl(`${window.location.origin}/api/calendario/feed/${token}.ics`);
        setCopied(false);
      },
    });
  }

  function disable() {
    if (!window.confirm("¿Desactivar el enlace? Google Calendar dejará de actualizarse con tus tareas.")) return;
    setError("");
    disableMutation.mutate(undefined, { onSuccess: () => setFeedUrl(null) });
  }

  const shownError = error || (statusQuery.isError ? "No se pudo consultar el estado del enlace." : "");

  async function copy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setFeedUrl(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sincronizar con Google Calendar</DialogTitle>
          <DialogDescription>
            Lleva tus tareas (compromisos, revisiones y entregas) a Google Calendar como eventos de todo el día.
          </DialogDescription>
        </DialogHeader>

        <GoogleCalendarSyncSection open={open} />

        <div className="space-y-3 text-sm">
          <h3 className="font-medium">Enlace de suscripción</h3>
          {feedUrl ? (
            <>
              <p className="text-muted-foreground">
                Este es tu enlace privado. <strong className="text-foreground">Cópialo ahora</strong>: por seguridad no
                se vuelve a mostrar. Cualquiera con el enlace puede ver tus tareas.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={feedUrl} aria-label="Enlace del calendario" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" onClick={() => void copy()}>
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>En Google Calendar abre <em>Otros calendarios</em> → <em>+</em> → <em>Desde URL</em>.</li>
                <li>Pega el enlace y pulsa <em>Agregar calendario</em>.</li>
                <li>Google lo actualiza cada varias horas; no es instantáneo.</li>
              </ol>
            </>
          ) : enabled ? (
            <p className="text-muted-foreground">
              Ya tienes un enlace activo. Si lo perdiste, regenera uno nuevo — el anterior dejará de funcionar.
            </p>
          ) : (
            <p className="text-muted-foreground">Aún no has creado un enlace.</p>
          )}
          {shownError ? <p className="text-destructive">{shownError}</p> : null}
        </div>

        <DialogFooter>
          {enabled ? (
            <Button variant="outline" disabled={busy} onClick={disable}>
              Desactivar
            </Button>
          ) : null}
          <Button disabled={busy || enabled === null} onClick={generate}>
            {enabled ? "Regenerar enlace" : "Crear enlace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

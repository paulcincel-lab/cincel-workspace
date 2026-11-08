"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";

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
          <p className="text-muted-foreground">
            Sincronizando con <span className="text-foreground">{status.connectedEmail}</span> en el calendario
            «Cincel».{" "}
            {status.lastSyncedAt ? `Última sincronización: ${formatSyncedAt(status.lastSyncedAt)}.` : null}
          </p>
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
              Desactivar
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

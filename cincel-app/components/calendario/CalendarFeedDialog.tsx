"use client";

import { useEffect, useState } from "react";

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
  fetchCalendarFeedStatusAction,
  fetchGoogleCalendarSyncStatusAction,
  generateCalendarFeedAction,
  syncGoogleCalendarAction,
  type GoogleCalendarSyncStatus,
} from "@/lib/actions/calendar-actions";

type Props = { open: boolean; onClose: () => void };

function formatSyncedAt(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Direct sync (#434): with the user's own Google account connected (Calendar
 * scope), tasks are pushed into a "Cincel" calendar the app creates there —
 * updates land within minutes instead of Google's hours-long ICS polling.
 */
function GoogleCalendarSyncSection({ open }: { open: boolean }) {
  const [status, setStatus] = useState<GoogleCalendarSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = () =>
    fetchGoogleCalendarSyncStatusAction()
      .then(setStatus)
      .catch(() => setError("No se pudo consultar la sincronización."));

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  async function run(action: () => Promise<{ ok: boolean; error?: string } | null | void>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const outcome = await action();
      if (outcome && !outcome.ok) setError(outcome.error ?? "No se pudo sincronizar.");
      else setMessage(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  function connect() {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/google/oauth/start?scope=calendar&return_to=${encodeURIComponent(returnTo)}`;
  }

  if (!status?.oauthAvailable) return null;

  return (
    <section className="space-y-3 text-sm" aria-label="Sincronización directa">
      <h3 className="font-medium">Sincronización directa</h3>
      {!status.hasCalendarScope ? (
        <>
          <p className="text-muted-foreground">
            Conecta tu cuenta de Google y crearemos un calendario «Cincel» con tus tareas. Solo podemos ver y editar ese
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
          <Button disabled={busy} onClick={() => void run(enableGoogleCalendarSyncAction, "Sincronización activada.")}>
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
          {status.lastError && !error && !message ? (
            <p className="text-destructive">Último error: {status.lastError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(() => syncGoogleCalendarAction(), "Calendario actualizado.")}>
              {busy ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("¿Dejar de sincronizar? El calendario «Cincel» se queda en Google; puedes borrarlo ahí.")) return;
                void run(disableGoogleCalendarSyncAction, "Sincronización desactivada.");
              }}
            >
              Desactivar
            </Button>
            {error || status.lastError ? (
              <Button variant="ghost" disabled={busy} onClick={connect}>
                Reconectar cuenta
              </Button>
            ) : null}
          </div>
        </>
      )}
      {message ? <p className="text-muted-foreground">{message}</p> : null}
      {error ? <p className="text-destructive">{error}</p> : null}
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
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchCalendarFeedStatusAction()
      .then((status) => {
        if (!cancelled) setEnabled(status.enabled);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo consultar el estado del enlace.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const { token } = await generateCalendarFeedAction();
      setFeedUrl(`${window.location.origin}/api/calendario/feed/${token}.ics`);
      setEnabled(true);
      setCopied(false);
    } catch {
      setError("No se pudo generar el enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("¿Desactivar el enlace? Google Calendar dejará de actualizarse con tus tareas.")) return;
    setBusy(true);
    setError("");
    try {
      await disableCalendarFeedAction();
      setEnabled(false);
      setFeedUrl(null);
    } catch {
      setError("No se pudo desactivar el enlace.");
    } finally {
      setBusy(false);
    }
  }

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
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          {enabled ? (
            <Button variant="outline" disabled={busy} onClick={() => void disable()}>
              Desactivar
            </Button>
          ) : null}
          <Button disabled={busy || enabled === null} onClick={() => void generate()}>
            {enabled ? "Regenerar enlace" : "Crear enlace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

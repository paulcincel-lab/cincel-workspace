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
  fetchCalendarFeedStatusAction,
  generateCalendarFeedAction,
} from "@/lib/actions/calendar-actions";

type Props = { open: boolean; onClose: () => void };

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
            Suscribe tu Google Calendar a tus tareas (compromisos, revisiones y entregas). Aparecen como eventos de
            todo el día y se actualizan solos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
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

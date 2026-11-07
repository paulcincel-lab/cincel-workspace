"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { XIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { fetchMyPreferencesAction, updateMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { actionErrorCode } from "@/lib/errors";
import { resolveAppearance } from "@/lib/ui/preferences";
import {
  REDESIGN_OPT_IN_DISABLED_COPY,
  redesignBannerDismissKey,
  redesignOptInErrorText,
  redesignOptInVisibility,
  type RedesignOptInVisibility,
} from "@/lib/ui/redesign-opt-in";

/**
 * Opt-in to the new design from the legacy UI (redesign FE §2.3): both entry
 * points call `updateMyPreferencesAction({ redesignEnabled: true })` and then
 * `router.refresh()`, so the server renders the new shell. No admin page.
 */
function useRedesignOptIn() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const activate = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await updateMyPreferencesAction({ redesignEnabled: true });
      startTransition(() => router.refresh());
    } catch (err) {
      // The error and the end of the pending state land in the same render.
      if (actionErrorCode(err) === "DISABLED") setDisabled(true);
      setError(redesignOptInErrorText(err));
    } finally {
      setIsSaving(false);
    }
  };

  return { activate, isPending: isSaving || isRefreshing, error, disabled };
}

// Dismissals made during this visit, so the banner stays hidden even when storage is blocked.
const dismissedThisVisit = new Set<string>();
const dismissListeners = new Set<() => void>();

function readDismissed(key: string): boolean {
  if (dismissedThisVisit.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage blocked: the banner stays dismissed for this visit only.
    dismissedThisVisit.add(key);
  }
  dismissListeners.forEach((listener) => listener());
}

function subscribeDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    dismissListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export type RedesignOptInBannerProps = {
  /** The signed-in staff id; the dismissal is remembered per user. */
  userId: string;
  /** From `redesignOptInVisibility` on the server; the banner renders only for `available`. */
  visibility: RedesignOptInVisibility;
};

/** Dismissible banner on the legacy dashboard: "Prueba el nuevo diseño" + "Activar". */
export function RedesignOptInBanner({ userId, visibility }: RedesignOptInBannerProps) {
  const storageKey = redesignBannerDismissKey(userId);
  // null until client storage is read, so a dismissed banner never flashes in.
  const dismissed = useSyncExternalStore<boolean | null>(
    subscribeDismissed,
    () => readDismissed(storageKey),
    () => null,
  );
  const { activate, isPending, error, disabled } = useRedesignOptIn();

  if (visibility !== "available" || dismissed !== false) return null;

  const dismiss = () => {
    writeDismissed(storageKey);
  };

  return (
    <Alert className="mb-6" aria-label="Nuevo diseño">
      <AlertTitle>Prueba el nuevo diseño</AlertTitle>
      <AlertDescription>
        <p>Una forma más clara de ver tus proyectos y tareas. Puedes volver al diseño anterior cuando quieras.</p>
        {error ? <p role="status">{error}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={activate} disabled={isPending || disabled}>
            {isPending ? "Activando…" : "Activar"}
          </Button>
        </div>
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar aviso" onClick={dismiss}>
          <XIcon aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * Legacy menu entry "Probar el nuevo diseño" (placed on the legacy `/profile`
 * page so the legacy `Sidebar` / `Header` stay untouched). Reads the caller's
 * preferences and the org appearance to know whether to show itself.
 */
export function RedesignOptInEntry() {
  const [visibility, setVisibility] = useState<RedesignOptInVisibility>("hidden");
  const { activate, isPending, error, disabled } = useRedesignOptIn();

  useEffect(() => {
    if (!IMPLEMENTED.updateMyPreferencesAction) return;
    let cancelled = false;
    Promise.all([fetchOrgAppearanceAction(), fetchMyPreferencesAction()])
      .then(([org, preferences]) => {
        if (cancelled) return;
        setVisibility(
          redesignOptInVisibility({
            implemented: IMPLEMENTED.updateMyPreferencesAction,
            redesignEnabled: resolveAppearance(org, preferences).redesignEnabled,
            redesignAvailable: org.redesignAvailable,
          }),
        );
      })
      .catch(() => {
        // Unknown state: keep the entry hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (visibility === "hidden") return null;

  const unavailable = visibility === "unavailable" || disabled;
  const message = visibility === "unavailable" ? REDESIGN_OPT_IN_DISABLED_COPY : error;

  return (
    <section aria-labelledby="redesign-opt-in-title" className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 id="redesign-opt-in-title" className="text-lg font-semibold text-foreground">
        Nuevo diseño
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Prueba la nueva forma de ver Cincel. Puedes volver al diseño anterior desde el menú de tu perfil.
      </p>
      {message ? (
        <p id="redesign-opt-in-message" role="status" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <Button
        className="mt-4"
        onClick={activate}
        disabled={isPending || unavailable}
        aria-describedby={message ? "redesign-opt-in-message" : undefined}
      >
        {isPending ? "Activando…" : "Probar el nuevo diseño"}
      </Button>
    </section>
  );
}

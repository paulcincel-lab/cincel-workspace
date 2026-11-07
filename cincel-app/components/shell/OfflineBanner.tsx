"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/shadcn/alert";
import { OFFLINE_COPY } from "@/lib/ui/route-states";

/**
 * Offline banner (redesign FE §3.12, frame `EstadosSistema` "Sin conexión"):
 * while `navigator.onLine` is false, a top `Alert` says changes will be saved
 * on reconnect. Informational only (no offline queue); it disappears on the
 * `online` event. Rendered by the new shell above the page content.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** The server never knows; it renders as online so hydration matches. */
function isOnlineOnServer(): boolean {
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnlineOnServer);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div data-slot="offline-banner" className="px-4 pt-4">
      <Alert role="status" aria-live="polite">
        <WifiOff aria-hidden="true" />
        <AlertTitle>{OFFLINE_COPY}</AlertTitle>
      </Alert>
    </div>
  );
}

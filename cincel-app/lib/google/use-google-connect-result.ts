"use client";

import { useEffect, useState } from "react";

const REASON_LABEL: Record<string, string> = {
  denied: "Cancelaste la conexión con Google.",
  state_mismatch: "La conexión expiró, intenta de nuevo.",
  exchange_failed: "No se pudo completar la conexión con Google.",
  unauthorized: "Tu sesión expiró, vuelve a iniciar sesión.",
};

/**
 * Reads the `google_connected=1|error` query params the OAuth callback
 * route (app/api/google/oauth/callback) redirects back with, returns a
 * one-line result to show the user, and strips the params from the URL so
 * refreshing the page doesn't re-show it.
 */
export function useGoogleConnectResult(): { success: boolean; message: string } | null {
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("google_connected");
    if (!status) return;

    if (status === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult({ success: true, message: "Cuenta de Google conectada." });
    } else {
      const reason = url.searchParams.get("reason") ?? "";
      setResult({ success: false, message: REASON_LABEL[reason] ?? "No se pudo conectar la cuenta de Google." });
    }

    url.searchParams.delete("google_connected");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return result;
}

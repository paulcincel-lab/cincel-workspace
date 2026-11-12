"use client";

import { useEffect, useState } from "react";

import { getDenialMessage } from "@/lib/auth/denial-messages";
import { isWorkspaceDenialReason } from "@/lib/types/workspace-access";

const REASON_LABEL: Record<string, string> = {
  denied: "Cancelaste la conexión con Google.",
  state_mismatch: "La conexión expiró, intenta de nuevo.",
  exchange_failed: "No se pudo completar la conexión con Google.",
  unauthorized: "Tu sesión expiró, vuelve a iniciar sesión.",
  retry: "No se pudo completar la conexión con Google. Intenta de nuevo.",
  access_denied: "Tu administrador todavía no habilita Google Calendar para Cincel.",
  scope_missing: "No diste el permiso que pedimos en Google. Intenta de nuevo y marca la casilla del permiso.",
};

const FALLBACK_ERROR = "No se pudo conectar la cuenta de Google.";

export type GoogleConnectResult = { success: boolean; message: string };

/**
 * Result for the `google_connected` / `motivo` (staff consent, BE §A.6.2) or
 * legacy `reason` query params; `null` without them.
 */
export function googleConnectResultFrom(params: URLSearchParams): GoogleConnectResult | null {
  const status = params.get("google_connected");
  if (!status) return null;
  if (status === "1") return { success: true, message: "Cuenta de Google conectada." };

  const reason = params.get("motivo") ?? params.get("reason") ?? "";
  const message = REASON_LABEL[reason] ?? (isWorkspaceDenialReason(reason) ? getDenialMessage(reason) : FALLBACK_ERROR);
  return { success: false, message };
}

/**
 * Reads the `google_connected=1|error` query params the OAuth callback route
 * (app/api/auth/google/callback for staff consent) redirects back with, returns
 * a one-line result to show the user, and strips the params from the URL so
 * refreshing the page doesn't re-show it.
 */
export function useGoogleConnectResult(): GoogleConnectResult | null {
  const [result, setResult] = useState<GoogleConnectResult | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const next = googleConnectResultFrom(url.searchParams);
    if (!next) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(next);

    url.searchParams.delete("google_connected");
    url.searchParams.delete("motivo");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return result;
}

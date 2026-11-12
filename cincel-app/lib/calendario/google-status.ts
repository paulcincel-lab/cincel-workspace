/** Pure rules of the Google connection of Calendario (FE §6.2, §6.3). Client-safe. */
import { agoLabel } from "@/components/calendario/meeting-format";

export const GOOGLE_STATUS_COPY = {
  banner: "Conecta Google Calendar para ver tus reuniones.",
  bannerReauth: "Vuelve a conectar Google Calendar",
  denied: "Tu administrador todavía no habilita Google Calendar para Cincel.",
  connect: "Conectar",
  later: "Ahora no",
  refresh: "Actualizar",
  refreshing: "Actualizando…",
  retry: "Reintentar",
  notConnected: "No conectado",
  reauth: "Vuelve a conectar Google Calendar",
  failed: "No se pudo actualizar Google Calendar.",
  connectedNoSync: "Google Calendar · conectado",
  rowTitle: "Reuniones y disponibilidad",
  rowDescription: "Tus reuniones de Google Calendar y la disponibilidad del equipo para planear.",
  synced: (t: string) => `Google Calendar · sincronizado hace ${t}`,
  rowConnected: (t: string | null) => (t ? `Conectado · sincronizado hace ${t}` : "Conectado"),
} as const;

export type GoogleInfo = { connected: boolean; eventsGrant: boolean; syncedAt: string | null; error: string | null };

export type GoogleStatusKind = "not_connected" | "denied" | "reauth" | "failed" | "synced" | "connected";

export type GoogleStatus = {
  kind: GoogleStatusKind;
  /** The status line copy. */
  text: string;
  /** What the action next to the line does, if any. */
  action: "connect" | "retry" | null;
};

/** The status line of the Analítico drawer and of Ajustes › Integraciones. */
export function googleStatusOf(google: GoogleInfo, now: number = Date.now()): GoogleStatus {
  if (google.error === "ACCESS_DENIED") return { kind: "denied", text: GOOGLE_STATUS_COPY.denied, action: null };
  if (google.error === "REAUTH") return { kind: "reauth", text: GOOGLE_STATUS_COPY.reauth, action: "connect" };
  if (!google.connected || !google.eventsGrant) {
    return { kind: "not_connected", text: GOOGLE_STATUS_COPY.notConnected, action: "connect" };
  }
  if (google.error) return { kind: "failed", text: GOOGLE_STATUS_COPY.failed, action: "retry" };
  if (!google.syncedAt) return { kind: "connected", text: GOOGLE_STATUS_COPY.connectedNoSync, action: null };
  return { kind: "synced", text: GOOGLE_STATUS_COPY.synced(agoLabel(google.syncedAt, now)), action: null };
}

/** The one-time banner of the page: no grant yet, or a token to renew; never once dismissed this session. */
export function shouldShowGoogleBanner(google: GoogleInfo, dismissed: boolean): boolean {
  if (dismissed) return false;
  if (google.error === "ACCESS_DENIED" || google.error === "REAUTH") return true;
  return !google.connected || !google.eventsGrant;
}

/** The banner offers "Conectar" unless the admin has not allowed the scopes. */
export function bannerCopy(google: GoogleInfo): { text: string; canConnect: boolean } {
  if (google.error === "ACCESS_DENIED") return { text: GOOGLE_STATUS_COPY.denied, canConnect: false };
  if (google.error === "REAUTH") return { text: GOOGLE_STATUS_COPY.bannerReauth, canConnect: true };
  return { text: GOOGLE_STATUS_COPY.banner, canConnect: true };
}

/** The refresh runs on its own only with a live grant and no admin/token problem. */
export function canAutoRefresh(google: GoogleInfo): boolean {
  return google.connected && google.eventsGrant && google.error !== "ACCESS_DENIED" && google.error !== "REAUTH";
}

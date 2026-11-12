"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarDaysIcon,
  ExternalLinkIcon,
  HardDriveIcon,
  LayoutGridIcon,
  MailIcon,
  MessagesSquareIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { CalendarFeedLinkSection, GoogleCalendarSyncSection } from "@/components/calendario/CalendarFeedDialog";
import { GoogleMeetingsRow } from "@/components/calendario/GoogleMeetingsRow";
import { FormDialog } from "@/components/patterns/FormDialog";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { disconnectGmailAction, syncGmailAction } from "@/lib/actions/gmail-actions";
import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { CUTTO_LINK_TARGET } from "@/lib/integrations/cutto-links";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesIntegracionesOptions, type AjustesIntegracionesPageData } from "@/lib/query/options/ajustes";
import { IntegracionesUiStoreProvider, useIntegracionesUi } from "@/lib/stores/ajustes/integraciones-ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import type { GmailStatus } from "@/lib/types/redesign";

// ── Copy and links (redesign FE §3.8) ───────────────────────────────────────

/** Incremental Gmail consent (`gmail.readonly` + `gmail.compose`, BE §7.6). */
export const GMAIL_CONNECT_URL = "/api/auth/google/start?grant=gmail";

/** Incremental Drive consent (existing flow); comes back to this page. */
export const DRIVE_CONNECT_URL = "/api/auth/google/start?scope=drive&return_to=%2Fajustes%2Fintegraciones";

/** Google account permissions, where the person removes the mail grant entirely. */
export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

export const MONDAY_SETTINGS_URL = "/ajustes/monday";

/** Cutto is a separate app; Cincel only links to it (no integration behavior here). */
export const CUTTO_BASE_URL = process.env.NEXT_PUBLIC_CUTTO_BASE_URL?.trim() || "https://cutto.cloudketer.dev";

export const GMAIL_DISCONNECT_TITLE = "¿Desconectar Gmail de Cincel?";
export const GMAIL_DISCONNECT_COPY =
  "Cincel dejará de leer tu correo y borrará la copia de tus conversaciones guardada aquí. Tu cuenta de Google sigue conectada para Drive y Calendar; para quitar el permiso de correo por completo, entra a los permisos de tu cuenta de Google.";
export const CUTTO_COPY = "Cutto es una aplicación aparte. Cincel enlaza a los canales de cada proyecto.";
export const MONDAY_COPY =
  "Importa tableros y tarjetas a Cincel. Las importaciones de monday se hacen en Ajustes › monday.";
export const DRIVE_NOT_CONNECTED_COPY =
  "Conecta Drive para adjuntar planos y renders a tareas y proyectos sin descargarlos.";

/** The Gmail scopes the app really requests (`GMAIL_CONNECT_URL`, BE §7.6). */
export const GMAIL_SCOPES = ["gmail.readonly", "gmail.compose"] as const;
/** The Drive scope the Drive consent asks for. */
export const DRIVE_SCOPE = "drive.file";

/** `syncGmailAction` allows one run every 30 s per person (BE rate limits). */
export const GMAIL_SYNC_COOLDOWN_MS = 30_000;

export const GOOGLE_UNAVAILABLE_COPY = "Google no está configurado en Cincel. Pídele a un administrador que lo active.";

export const DISCONNECTED_GMAIL: GmailStatus = { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null };

const syncedAtFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/** es-MX date and time, lowercase (FE §13). */
export function formatSyncedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : syncedAtFormat.format(date).toLowerCase();
}

const mxDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });
const mxTimeFormat = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Mexico_City",
});

/** "hoy 09:42" for a sync today (Ciudad de México), else the full date and time. */
export function formatLastSync(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (mxDayFormat.format(date) === mxDayFormat.format(new Date(now))) return `hoy ${mxTimeFormat.format(date)}`;
  return formatSyncedAt(iso);
}

/** Whether a manual sync now would hit the 30 s limit. */
export function isWithinSyncCooldown(lastSyncedAt: string | null, now: number = Date.now()): boolean {
  if (!lastSyncedAt) return false;
  const at = Date.parse(lastSyncedAt);
  return !Number.isNaN(at) && now - at >= 0 && now - at < GMAIL_SYNC_COOLDOWN_MS;
}

export type GmailCardState = "not_connected" | "scope_missing" | "error" | "connected";

export function gmailCardState(status: GmailStatus): GmailCardState {
  if (!status.connected) return "not_connected";
  if (!status.scopeOk) return "scope_missing";
  if (status.lastError) return "error";
  return "connected";
}

// ── Page state ──────────────────────────────────────────────────────────────

export type DriveIntegrationStatus = AjustesIntegracionesPageData["drive"];

export type IntegracionesClientProps = {
  /** The visible cards of the page, in order. */
  children?: ReactNode;
};

/** The hydrated `qk.ajustes.page('integraciones')`: Gmail status and the DB-only Drive grant. */
function useIntegracionesData(): AjustesIntegracionesPageData {
  return useSuspenseQuery(ajustesIntegracionesOptions()).data;
}

/** The signed-in Google account (the session email). */
function useAccountEmail(): string | null {
  return useSessionStore((s) => s.access.user?.email ?? null);
}

/**
 * After a Gmail sync or disconnect: the Gmail caches (Mi espacio) and this
 * page's statuses. The Google Calendar sync and the calendar feed dialog
 * invalidate `qk.ajustes.page('integraciones')` too.
 */
const GMAIL_INVALIDATE = [qk.me.gmail.all, qk.ajustes.page("integraciones")] as const;

/**
 * Ajustes › Integraciones (redesign FE §3.8): the cards read the hydrated
 * `qk.ajustes.page('integraciones')`; the dialog and inline errors live in a
 * page-scoped store, reset when the page unmounts. The page passes the
 * visible cards (the settings sections of
 * `lib/shell/settings-sections/integraciones/*` plus the Cutto link card) as
 * children. Settings ignore the presentation style.
 */
export function IntegracionesClient({ children }: IntegracionesClientProps) {
  return (
    <IntegracionesUiStoreProvider>
      <div className="flex flex-col gap-4">{children}</div>
    </IntegracionesUiStoreProvider>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return <Badge variant={connected ? "success" : "outline"}>{connected ? "Conectado" : "No conectado"}</Badge>;
}

/** 40 px service tile (10 px radius) before the card title. */
function ServiceIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground"
    >
      <Icon className="size-5" strokeWidth={1.8} />
    </span>
  );
}

/** Scope chips: Geist Mono 11.5 px, pill, `--muted`. */
function ScopeChips({ scopes, label }: { scopes: readonly string[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {scopes.map((scope) => (
        <li key={scope} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11.5px] text-sidebar-foreground">
          {scope}
        </li>
      ))}
    </ul>
  );
}

/** Card actions row (h 34 px buttons). */
function ActionsRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** Re-renders when the 30 s sync cooldown of `lastSyncedAt` ends; true while it lasts. */
function useSyncCooldown(lastSyncedAt: string | null): boolean {
  const [, setTick] = useState(0);
  const cooling = isWithinSyncCooldown(lastSyncedAt);
  useEffect(() => {
    if (!cooling || !lastSyncedAt) return;
    const remaining = GMAIL_SYNC_COOLDOWN_MS - (Date.now() - Date.parse(lastSyncedAt));
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, remaining) + 50);
    return () => clearTimeout(timer);
  }, [cooling, lastSyncedAt]);
  return cooling;
}

// ── Gmail ───────────────────────────────────────────────────────────────────

/** Gmail card: status, account, Conectar, Sincronizar ahora, Desconectar. */
export function IntegracionesGmail() {
  const { gmail } = useIntegracionesData();
  const accountEmail = useAccountEmail();
  const syncError = useIntegracionesUi((s) => s.syncError);
  const setSyncError = useIntegracionesUi((s) => s.setSyncError);
  const dialogOpen = useIntegracionesUi((s) => s.disconnectOpen);
  const setDialogOpen = useIntegracionesUi((s) => s.setDisconnectOpen);
  const disconnectError = useIntegracionesUi((s) => s.disconnectError);
  const setDisconnectError = useIntegracionesUi((s) => s.setDisconnectError);

  // Both refresh the status through the query (no hand-written refetch).
  const syncMutation = useActionMutation(syncGmailAction, {
    invalidate: GMAIL_INVALIDATE,
    errorContext: "gmail",
    successToast: "Gmail sincronizado.",
    onFormError: setSyncError,
  });
  const disconnectMutation = useActionMutation(disconnectGmailAction, {
    invalidate: GMAIL_INVALIDATE,
    errorContext: "gmail",
    successToast: "Gmail desconectado.",
    onFormError: setDisconnectError,
  });
  const syncing = syncMutation.isPending;
  const disconnecting = disconnectMutation.isPending;

  const state = gmailCardState(gmail);
  const canSync = GMAIL_IMPLEMENTED.syncGmailAction && gmail.connected && gmail.scopeOk;
  const canDisconnect = GMAIL_IMPLEMENTED.disconnectGmailAction && gmail.connected;
  const showConnect = state !== "connected";

  function sync() {
    setSyncError(null);
    if (isWithinSyncCooldown(gmail.lastSyncedAt)) {
      setSyncError(actionErrorText(new Error("RATE_LIMITED"), "gmail"));
      return;
    }
    syncMutation.mutate(undefined);
  }

  async function disconnect() {
    setDisconnectError(null);
    try {
      await disconnectMutation.mutateAsync(undefined);
    } catch {
      // The error copy is already in the dialog (`onFormError`).
      return;
    }
    setSyncError(null);
    setDialogOpen(false);
  }

  const cooling = useSyncCooldown(gmail.lastSyncedAt);
  const lastSync = gmail.lastSyncedAt
    ? `Última sincronización: ${formatLastSync(gmail.lastSyncedAt)}`
    : "Aún no se sincroniza";

  return (
    <SettingsSection
      title="Gmail"
      description="Correo en Mi espacio y tareas desde correos."
      icon={<ServiceIcon icon={MailIcon} />}
      actions={
        state === "connected" ? (
          <StatusBadge connected />
        ) : state === "not_connected" ? (
          <StatusBadge connected={false} />
        ) : state === "scope_missing" ? (
          <Badge variant="destructive">Falta permiso</Badge>
        ) : (
          <Badge variant="destructive">Error al sincronizar</Badge>
        )
      }
    >
      <div className="flex flex-col gap-3" data-testid="gmail-card" data-state={state}>
        {showConnect || canSync || canDisconnect ? (
          <ActionsRow>
            {showConnect ? (
              <a
                href={GMAIL_CONNECT_URL}
                className={buttonVariants({ variant: state === "not_connected" ? "default" : "outline" })}
              >
                {state === "not_connected" ? "Conectar" : "Volver a conectar"}
              </a>
            ) : null}
            {canSync ? (
              <Button variant="outline" disabled={syncing || cooling} onClick={sync}>
                <RefreshCwIcon aria-hidden="true" data-icon="inline-start" className={syncing ? "spin" : undefined} />
                {syncing ? "Sincronizando…" : "Sincronizar ahora"}
              </Button>
            ) : null}
            {canDisconnect ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDisconnectError(null);
                  setDialogOpen(true);
                }}
              >
                Desconectar
              </Button>
            ) : null}
          </ActionsRow>
        ) : null}
        {gmail.connected ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-sidebar-foreground">
            {accountEmail ? <span>{accountEmail}</span> : null}
            <span className="font-mono">{lastSync}</span>
            <ScopeChips scopes={GMAIL_SCOPES} label="Permisos de Gmail" />
          </div>
        ) : (
          <ScopeChips scopes={GMAIL_SCOPES} label="Permisos de Gmail" />
        )}
        {state === "scope_missing" ? (
          <Alert variant="destructive">
            <AlertDescription>{actionErrorText(new Error("SCOPE_MISSING"), "gmail")}</AlertDescription>
          </Alert>
        ) : null}
        {state === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              {gmail.lastError === "invalid_grant"
                ? actionErrorText(new Error("NOT_CONNECTED"), "gmail")
                : actionErrorText(gmail.lastError, "gmail")}
            </AlertDescription>
          </Alert>
        ) : null}
        {syncError ? (
          <p role="alert" className="text-sm text-destructive">
            {syncError}
          </p>
        ) : null}
      </div>

      {canDisconnect ? (
        <FormDialog
          title={GMAIL_DISCONNECT_TITLE}
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!disconnecting) setDialogOpen(open);
          }}
          onSubmit={disconnect}
          submitLabel="Desconectar"
          pending={disconnecting}
          error={disconnectError}
        >
          <div className="flex flex-col items-start gap-3 text-sm">
            <p>{GMAIL_DISCONNECT_COPY}</p>
            <a
              href={GOOGLE_PERMISSIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "link" })}
            >
              Abrir permisos de Google
            </a>
          </div>
        </FormDialog>
      ) : null}
    </SettingsSection>
  );
}

// ── Google Calendar ─────────────────────────────────────────────────────────

/**
 * Google Calendar card: the direct sync controls of Calendario and the
 * subscription link (`CalendarFeedLinkSection`), inline instead of in a dialog.
 */
export function IntegracionesGoogleCalendar() {
  const googleConfigured = useIntegracionesData().drive.configured;
  return (
    <SettingsSection
      title="Google Calendar"
      description="Eventos en Calendario y en Mi día."
      icon={<ServiceIcon icon={CalendarDaysIcon} />}
    >
      {googleConfigured ? (
        <GoogleCalendarSyncSection open />
      ) : (
        <p className="text-sm text-muted-foreground">{GOOGLE_UNAVAILABLE_COPY}</p>
      )}
      {googleConfigured ? <GoogleMeetingsRow /> : null}
      <CalendarFeedLinkSection />
    </SettingsSection>
  );
}

// ── Google Drive ────────────────────────────────────────────────────────────

/** Google Drive card: the person's own Drive grant, read from the DB only (`getPickerDriveGrant`). */
export function IntegracionesGoogleDrive() {
  const { drive } = useIntegracionesData();
  const accountEmail = useAccountEmail();
  const connected = drive.configured && drive.hasDriveGrant;
  return (
    <SettingsSection
      title="Google Drive"
      description="Archivos de proyecto sin duplicarlos."
      icon={<ServiceIcon icon={HardDriveIcon} />}
      actions={<StatusBadge connected={connected} />}
    >
      <div className="flex flex-col gap-3" data-testid="drive-card">
        {!drive.configured ? (
          <p className="text-sm text-muted-foreground">{GOOGLE_UNAVAILABLE_COPY}</p>
        ) : connected ? (
          accountEmail ? <p className="text-[12.5px] text-sidebar-foreground">{accountEmail}</p> : null
        ) : (
          <>
            <ActionsRow>
              <a href={DRIVE_CONNECT_URL} className={buttonVariants()}>
                Conectar
              </a>
            </ActionsRow>
            <p className="text-[12.5px] text-muted-foreground">{DRIVE_NOT_CONNECTED_COPY}</p>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-sidebar-foreground">
              <span>Permiso que pedirá:</span>
              <ScopeChips scopes={[DRIVE_SCOPE]} label="Permisos de Google Drive" />
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
}

// ── Cutto (link only) ───────────────────────────────────────────────────────

/** Cutto card: the link and the copy only; Cutto is a separate app and nothing here talks to it (deep link, never embedded). */
export function IntegracionesCutto() {
  return (
    <SettingsSection title="Cutto" description={CUTTO_COPY} icon={<ServiceIcon icon={MessagesSquareIcon} />}>
      <ActionsRow>
        <a href={CUTTO_BASE_URL} {...CUTTO_LINK_TARGET} className={buttonVariants({ variant: "outline" })}>
          Abrir Cutto
          <ExternalLinkIcon aria-hidden="true" data-icon="inline-end" />
        </a>
      </ActionsRow>
    </SettingsSection>
  );
}

// ── monday (link) ───────────────────────────────────────────────────────────

/** monday card: link to Ajustes › monday (administrators only; the page filters it). */
export function IntegracionesMonday() {
  return (
    <SettingsSection title="monday" description={MONDAY_COPY} icon={<ServiceIcon icon={LayoutGridIcon} />}>
      <ActionsRow>
        <Link href={MONDAY_SETTINGS_URL} className={buttonVariants({ variant: "outline" })}>
          Ir a Importar de monday
        </Link>
      </ActionsRow>
    </SettingsSection>
  );
}

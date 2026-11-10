import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import type { GoogleHealth } from "@/lib/types/workspace-access";
import { cn } from "@/lib/utils";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** "7 nov" in America/Mexico_City; the raw text when it isn't a date. */
function formatShortDate(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(date).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]}` : at;
}

/** "N de M colaboradores activos ya entraron con Google". */
export function googleSignInProgress(health: Pick<GoogleHealth, "googleLinkedStaff" | "activeStaff">): string {
  return `${health.googleLinkedStaff} de ${health.activeStaff} colaboradores activos ya entraron con Google`;
}

/** Share of active staff already signed in with Google, 0–100 (0 without active staff). */
export function googleSignInPercent(health: Pick<GoogleHealth, "googleLinkedStaff" | "activeStaff">): number {
  if (health.activeStaff <= 0) return 0;
  return Math.min(100, Math.round((health.googleLinkedStaff / health.activeStaff) * 100));
}

/** How many names "Faltan:" lists before "y {n} más". */
export const PENDING_NAMES_SHOWN = 5;

/** "Faltan: Jorge Mena, Sofía León, Raúl Ortega." / "Faltan: A, B, C, D, E y 3 más."; null when nobody is missing. */
export function pendingStaffText(people: { name: string }[]): string | null {
  if (people.length === 0) return null;
  const shown = people.slice(0, PENDING_NAMES_SHOWN).map((person) => person.name);
  const rest = people.length - shown.length;
  return `Faltan: ${shown.join(", ")}${rest > 0 ? ` y ${rest} más` : ""}.`;
}

/** "0AJk3…Uk9PVA": the first 5 and last 6 characters of a long id. */
export function middleTruncate(value: string, head = 5, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Google isn't set up enough to sign in: no OAuth client or no group mapped (the setup banner shows instead of the ring). */
export function googleNotConfigured(health: Pick<GoogleHealth, "oauthClientConfigured" | "groupMappingCount">): boolean {
  return !health.oauthClientConfigured || health.groupMappingCount === 0;
}

type StatusTone = "configured" | "missing" | "error";

const STATUS_PILL: Record<StatusTone, { label: string; className: string }> = {
  configured: { label: "Configurado", className: "bg-tint-success text-success" },
  missing: { label: "Falta", className: "border border-border text-sidebar-foreground" },
  error: { label: "Error", className: "bg-tint-destructive text-destructive" },
};

function StatusPill({ tone }: { tone: StatusTone }) {
  const pill = STATUS_PILL[tone];
  return (
    <span
      data-slot="google-status"
      data-tone={tone}
      className={cn("ml-auto inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", pill.className)}
    >
      {pill.label}
    </span>
  );
}

/** One `.st` row: label · Geist Mono value · status pill on the right. */
function Row({ label, value, tone, valueTitle }: { label: string; value: ReactNode; tone?: StatusTone; valueTitle?: string }) {
  return (
    <div
      data-slot="google-status-row"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-muted py-2.5 text-[13px] last:border-b-0"
    >
      <dt className="w-52 shrink-0 text-sidebar-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span title={valueTitle} className="min-w-0 break-all font-mono text-[12.5px] text-foreground">
          {value}
        </span>
        {tone ? <StatusPill tone={tone} /> : null}
      </dd>
    </div>
  );
}

export type GoogleHealthStatusProps = {
  /** Null when `getGoogleHealthAction()` failed. */
  health: GoogleHealth | null;
  /**
   * Only the body (alerts and rows), without the card and its "Estado"
   * heading: Ajustes › Google renders it inside a `SettingsSection`.
   */
  bare?: boolean;
};

export const GOOGLE_HEALTH_TITLE = "Estado";
export const GOOGLE_HEALTH_DESCRIPTION = "Configuración de Google y avance del acceso con Google.";
export const GOOGLE_HEALTH_ERROR = "No se pudo cargar el estado de Google.";

/**
 * Ajustes › Google, "Estado" (canvas `Ajustes-Google`): one row per setting
 * with its value and "Configurado" / "Falta" / "Error". Never shows a secret:
 * the token key is "••••••••" once set.
 */
export function GoogleHealthStatus({ health, bare = false }: GoogleHealthStatusProps) {
  if (bare) {
    return (
      <div className="flex flex-col gap-4">
        <GoogleHealthBody health={health} />
      </div>
    );
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{GOOGLE_HEALTH_TITLE}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{GOOGLE_HEALTH_DESCRIPTION}</p>
      </div>

      <GoogleHealthBody health={health} />
    </section>
  );
}

function GoogleHealthBody({ health }: { health: GoogleHealth | null }) {
  if (!health) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{GOOGLE_HEALTH_ERROR}</AlertDescription>
      </Alert>
    );
  }
  const directoryError = health.lastDirectoryError;
  const driveError = health.lastDriveError;
  return (
    <>
      {health.groupMappingCount > 0 && health.roleGroupMappingCount === 0 ? (
        <Alert variant="destructive">
          <AlertTitle>No hay grupos con rol</AlertTitle>
          <AlertDescription>Nadie puede entrar con Google hasta que agregues al menos un grupo con rol.</AlertDescription>
        </Alert>
      ) : null}

      <dl className="flex flex-col">
        <Row
          label="Dominio de Workspace"
          value={health.workspaceDomain ?? "—"}
          tone={health.workspaceDomain ? "configured" : "missing"}
        />
        <Row label="Cliente OAuth" value="—" tone={health.oauthClientConfigured ? "configured" : "missing"} />
        <Row
          label="Cuenta de servicio"
          value={health.serviceAccountEmail ?? "—"}
          tone={health.serviceAccountEmail ? "configured" : "missing"}
        />
        <Row
          label="Llave de cifrado de tokens"
          value={health.tokenKeyConfigured ? "••••••••" : "—"}
          tone={health.tokenKeyConfigured ? "configured" : "missing"}
        />
        <Row
          label="Shared Drive ID"
          value={health.sharedDriveId ? middleTruncate(health.sharedDriveId) : "—"}
          valueTitle={health.sharedDriveId ?? undefined}
          tone={health.sharedDriveId ? "configured" : "missing"}
        />
        <Row
          label="Último error de Drive"
          value={driveError ? `${formatShortDate(driveError.at)} · ${driveError.message}` : "Sin errores"}
          tone={driveError ? "error" : undefined}
        />
        <Row
          label="Último error del Directorio"
          value={
            directoryError
              ? `${formatShortDate(directoryError.at)} · ${directoryError.message}${
                  directoryError.status ? ` (HTTP ${directoryError.status})` : ""
                }`
              : "Sin errores"
          }
          tone={directoryError ? "error" : undefined}
        />
      </dl>
    </>
  );
}

const RING_RADIUS = 43;

/**
 * Ajustes › Google, "Acceso con Google": 96 px progress ring (`ring` motion,
 * static under reduced motion) with the percent in the center, the progress
 * sentence, who is still missing (first five names) and the link to the
 * first steps. The ring is an image named by the sentence.
 */
export function GoogleAccessProgress({ health }: { health: GoogleHealth }) {
  const percent = googleSignInPercent(health);
  const sentence = googleSignInProgress(health);
  const missing = percent < 100 ? pendingStaffText(health.pendingGoogleStaff) : null;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div role="img" aria-label={sentence} className="relative size-24 shrink-0">
        <svg viewBox="0 0 96 96" className="size-24 -rotate-90" aria-hidden="true">
          <circle cx="48" cy="48" r={RING_RADIUS} fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle
            cx="48"
            cy="48"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="10"
            strokeLinecap="round"
            pathLength={100}
            className="ring"
            style={{ "--ring-offset": 100 - percent } as CSSProperties}
          />
        </svg>
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[22px] font-semibold text-foreground">
          {percent} %
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13.5px] text-foreground">{sentence}</p>
        {missing ? <p className="text-xs text-muted-foreground">{missing}</p> : null}
        <Link
          href="/ajustes/google/primeros-pasos"
          className="mt-1 text-[13px] font-medium text-secondary-foreground underline-offset-4 hover:underline"
        >
          Primeros pasos →
        </Link>
      </div>
    </div>
  );
}

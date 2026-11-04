import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import type { DirectoryErrorSource, GoogleHealth } from "@/lib/types/workspace-access";

const DIRECTORY_SOURCE_LABELS: Record<DirectoryErrorSource, string> = {
  sign_in: "inicio de sesión",
  group_mapping: "grupos de Google",
  recheck: "revisión de acceso",
};

const dateTimeFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function formatAt(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : dateTimeFormat.format(date);
}

/** "N de M colaboradores activos ya entraron con Google". */
export function googleSignInProgress(health: Pick<GoogleHealth, "googleLinkedStaff" | "activeStaff">): string {
  return `${health.googleLinkedStaff} de ${health.activeStaff} colaboradores activos ya entraron con Google`;
}

function Configured({ value }: { value: boolean }) {
  return value ? <Badge variant="secondary">Configurado</Badge> : <Badge variant="destructive">No configurado</Badge>;
}

function TextValue({ value }: { value: string | null }) {
  if (!value) return <Badge variant="destructive">No configurado</Badge>;
  return <span className="break-all font-mono text-sm">{value}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:items-center">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export type GoogleHealthStatusProps = {
  /** Null when `getGoogleHealthAction()` failed. */
  health: GoogleHealth | null;
};

/** Configuración → Google, section 1 "Estado" (FE §2.5, §5). */
export function GoogleHealthStatus({ health }: GoogleHealthStatusProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Estado</h2>
        <p className="mt-1 text-sm text-muted-foreground">Configuración de Google y avance del acceso con Google.</p>
      </div>

      {!health ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar el estado de Google.</AlertDescription>
        </Alert>
      ) : (
        <>
          {health.groupMappingCount === 0 ? (
            <Alert variant="destructive">
              <AlertTitle>No hay grupos de Google asignados</AlertTitle>
              <AlertDescription>Nadie puede entrar con Google hasta que agregues al menos un grupo con rol.</AlertDescription>
            </Alert>
          ) : health.roleGroupMappingCount === 0 ? (
            <Alert variant="destructive">
              <AlertTitle>No hay grupos con rol</AlertTitle>
              <AlertDescription>Nadie puede entrar con Google hasta que agregues al menos un grupo con rol.</AlertDescription>
            </Alert>
          ) : null}

          <dl className="divide-y divide-border">
            <Row label="Dominio de Workspace">
              <TextValue value={health.workspaceDomain} />
            </Row>
            <Row label="Cliente OAuth">
              <Configured value={health.oauthClientConfigured} />
            </Row>
            <Row label="Grupos de Google">
              <span>{health.groupMappingCount}</span>
              {health.groupMappingCount > 0 ? (
                <span className="text-muted-foreground"> ({health.roleGroupMappingCount} con rol)</span>
              ) : null}
            </Row>
            <Row label="Cuenta de servicio">
              <TextValue value={health.serviceAccountEmail} />
            </Row>
            <Row label="Shared Drive ID">
              <TextValue value={health.sharedDriveId} />
            </Row>
            <Row label="Llave de cifrado de tokens">
              <Configured value={health.tokenKeyConfigured} />
            </Row>
            <Row label="Último error del Directorio">
              {health.lastDirectoryError ? (
                <span>
                  <Badge variant="destructive">Error</Badge> {health.lastDirectoryError.message}
                  {health.lastDirectoryError.status ? ` (HTTP ${health.lastDirectoryError.status})` : ""}
                  {" · "}
                  {DIRECTORY_SOURCE_LABELS[health.lastDirectoryError.source] ?? health.lastDirectoryError.source}
                  {" · "}
                  {formatAt(health.lastDirectoryError.at)}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin errores</span>
              )}
            </Row>
            <Row label="Último error de Drive">
              {health.lastDriveError ? (
                <span>
                  <Badge variant="destructive">Error</Badge> {health.lastDriveError.message} · {formatAt(health.lastDriveError.at)}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin errores</span>
              )}
            </Row>
            <Row label="Acceso con Google">{googleSignInProgress(health)}</Row>
          </dl>
        </>
      )}
    </section>
  );
}

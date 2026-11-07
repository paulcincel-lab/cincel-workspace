import type { ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import type { PortalProjectDTO } from "@/lib/types/portal";
import { formatDateDMY } from "@/lib/utils/date";

const STATUS_LABEL: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

export function portalStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * Resumen tab (FE §3.3): status, progress, dates, address and manager contact, from PortalProjectDTO only.
 * `showProgress={false}` drops the progress bar where a library widget already shows it (redesign, FE §3.11).
 */
export default function PortalProjectSummary({
  project,
  showProgress = true,
}: {
  project: PortalProjectDTO;
  showProgress?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(project.progressPct)));
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Estado</span>
          <Badge variant="secondary">{portalStatusLabel(project.status)}</Badge>
        </div>
        {showProgress ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avance</span>
              <span className="font-medium tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} aria-label="Avance del proyecto" />
          </div>
        ) : null}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Inicio">{project.startDate ? formatDateDMY(project.startDate) : "—"}</Field>
          <Field label="Fin">{project.endDate ? formatDateDMY(project.endDate) : "—"}</Field>
          <Field label="Dirección">{project.address ?? "—"}</Field>
          <Field label="Responsable del proyecto">
            {project.manager ? (
              <span className="flex flex-col gap-0.5">
                <span>{project.manager.name}</span>
                {project.manager.email ? (
                  <a href={`mailto:${project.manager.email}`} className="break-all underline underline-offset-4">
                    {project.manager.email}
                  </a>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}

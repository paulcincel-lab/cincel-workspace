"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { setProjectCurrentTramoAction } from "@/lib/actions/projects-actions";
import { fichaFlowErrorText } from "@/lib/proyectos/flow-error-text";
import type { ProjectDetail, WorkflowRef } from "@/lib/types/core";

export interface ProjectTramosCardProps {
  project: ProjectDetail;
  /** Active tramos, in tramo order. */
  workflows: WorkflowRef[];
  /** `projects.canChangeProjectStage`. */
  canChangeTramo: boolean;
  onChanged: (p: ProjectDetail) => void;
  /** Administrators see "Asignar tramo" (`canSeeAdminData`). */
  isAdmin?: boolean;
  /** The project has tasks without a tramo; also shows "Asignar tramo" to admins. */
  hasTasksWithoutTramo?: boolean;
}

/** "Iniciado el 3 nov 2026" style dates; the value is an ISO timestamp or date. */
export function formatTramoDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Deep link that opens the Iniciar tramo sheet for this project (B1). */
export function startTramoHref(tramo: Pick<WorkflowRef, "key">, projectId: string): string {
  return `/actividades/${tramo.key}?project=${encodeURIComponent(projectId)}`;
}

export function ProjectTramosCard({
  project,
  workflows,
  canChangeTramo,
  onChanged,
  isAdmin = false,
  hasTasksWithoutTramo = false,
}: ProjectTramosCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);

  const started = project.tramos.filter((t) => t.startedAt);
  const startedIds = new Set(started.map((t) => t.id));
  const notStarted = workflows.filter((w) => !startedIds.has(w.id));
  const currentId = project.currentWorkflow?.id ?? project.tramos.find((t) => t.current)?.id ?? null;
  const showAssign = isAdmin && (project.needsTramo || hasTasksWithoutTramo);
  const assignTramo = workflows.find((w) => w.id === assignId) ?? null;

  async function setCurrent(workflowId: string) {
    if (workflowId === currentId) return;
    setPending(true);
    setError(null);
    try {
      const updated = await setProjectCurrentTramoAction(project.id, workflowId);
      onChanged(updated);
      setAssignId(null);
    } catch (err) {
      setError(fichaFlowErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tramos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {started.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún tramo iniciado todavía.</p>
        ) : (
          <ul className="space-y-2 text-sm" aria-label="Tramos iniciados">
            {started.map((tramo) => (
              <li key={tramo.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {tramo.name}
                  {tramo.id === currentId ? <Badge variant="outline">Tramo actual</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {tramo.closedAt
                    ? `Cerrado el ${formatTramoDate(tramo.closedAt)}`
                    : `Iniciado el ${formatTramoDate(tramo.startedAt as string)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canChangeTramo && started.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="ficha-tramo-actual" className="text-sm font-normal text-muted-foreground">
              Tramo actual
            </Label>
            <Select
              items={Object.fromEntries(started.map((t) => [t.id, t.name]))}
              value={currentId}
              disabled={pending}
              onValueChange={(v) => {
                if (typeof v === "string") void setCurrent(v);
              }}
            >
              <SelectTrigger id="ficha-tramo-actual" aria-label="Tramo actual" className="w-full sm:w-64">
                <SelectValue placeholder="Elige un tramo" />
              </SelectTrigger>
              <SelectContent>
                {started.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {canChangeTramo && notStarted.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {notStarted.map((w) => (
              <Link key={w.id} href={startTramoHref(w, project.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Iniciar {w.name}
              </Link>
            ))}
          </div>
        ) : null}

        {showAssign ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Asignar tramo</p>
            <p className="text-sm text-muted-foreground">
              {project.needsTramo
                ? "Este proyecto no tiene tramo actual."
                : "Hay tareas sin tramo; corrígelas desde el detalle de cada tarea en «Sin tramo»."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={Object.fromEntries(workflows.map((w) => [w.id, w.name]))}
                value={assignId}
                disabled={pending}
                onValueChange={(v) => setAssignId(typeof v === "string" ? v : null)}
              >
                <SelectTrigger aria-label="Asignar tramo" className="w-full sm:w-56">
                  <SelectValue placeholder="Elige un tramo" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignTramo && !startedIds.has(assignTramo.id) ? (
                <Link href={startTramoHref(assignTramo, project.id)} className={buttonVariants({ variant: "default" })}>
                  Iniciar
                </Link>
              ) : (
                <Button disabled={!assignTramo || pending} onClick={() => assignTramo && void setCurrent(assignTramo.id)}>
                  Iniciar
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

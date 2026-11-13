"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { setProjectCurrentEtapaAction } from "@/lib/actions/projects-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type { ProjectDetail, WorkflowRef } from "@/lib/types/core";

export interface ProjectEtapasCardProps {
  project: ProjectDetail;
  /** Active etapas, in etapa order. */
  workflows: WorkflowRef[];
  /** `projects.canChangeProjectStage`. */
  canChangeEtapa: boolean;
  /** Administrators see "Asignar etapa" (`canSeeAdminData`). */
  isAdmin?: boolean;
  /** The project has tasks without an etapa; also shows "Asignar etapa" to admins. */
  hasTasksWithoutEtapa?: boolean;
}

/** "Iniciado el 3 nov 2026" style dates; the value is an ISO timestamp or date. */
export function formatEtapaDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Deep link that opens the Iniciar etapa sheet for this project (B1). */
export function startEtapaHref(etapa: Pick<WorkflowRef, "key">, projectId: string): string {
  return `/actividades/${etapa.key}?project=${encodeURIComponent(projectId)}`;
}

/**
 * The ficha's Etapas card. Changing the current etapa is one mutation that
 * invalidates the project (`proyectos.detail(id)` prefix), the list and
 * Tareas; the ficha re-reads the project from its own query.
 */
export function ProjectEtapasCard({
  project,
  workflows,
  canChangeEtapa,
  isAdmin = false,
  hasTasksWithoutEtapa = false,
}: ProjectEtapasCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const setEtapa = useActionMutation<string, ProjectDetail>(
    (workflowId) => setProjectCurrentEtapaAction(project.id, workflowId),
    {
      invalidate: [qk.proyectos.detail(project.id), qk.proyectos.list(), qk.tareas.all],
      onFormError: setError,
    },
  );
  const pending = setEtapa.isPending;

  const started = project.etapas.filter((t) => t.startedAt);
  const startedIds = new Set(started.map((t) => t.id));
  const notStarted = workflows.filter((w) => !startedIds.has(w.id));
  const currentId = project.currentWorkflow?.id ?? project.etapas.find((t) => t.current)?.id ?? null;
  const showAssign = isAdmin && (project.needsEtapa || hasTasksWithoutEtapa);
  const assignEtapa = workflows.find((w) => w.id === assignId) ?? null;

  function setCurrent(workflowId: string) {
    if (workflowId === currentId) return;
    setError(null);
    setEtapa.mutate(workflowId, { onSuccess: () => setAssignId(null) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Etapas</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {started.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna etapa iniciada todavía.</p>
        ) : (
          <ul className="space-y-2 text-sm" aria-label="Etapas iniciadas">
            {started.map((etapa) => (
              <li key={etapa.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <span>{etapa.name}</span>
                  {etapa.id === currentId ? <Badge variant="outline">Etapa actual</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {etapa.closedAt
                    ? `Cerrado el ${formatEtapaDate(etapa.closedAt)}`
                    : `Iniciado el ${formatEtapaDate(etapa.startedAt as string)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canChangeEtapa && started.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="ficha-etapa-actual" className="text-sm font-normal text-muted-foreground">
              Etapa actual
            </Label>
            <Select
              items={Object.fromEntries(started.map((t) => [t.id, t.name]))}
              value={currentId}
              disabled={pending}
              onValueChange={(v) => {
                if (typeof v === "string") setCurrent(v);
              }}
            >
              <SelectTrigger id="ficha-etapa-actual" aria-label="Etapa actual" className="w-full sm:w-64">
                <SelectValue placeholder="Elige una etapa" />
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

        {canChangeEtapa && notStarted.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {notStarted.map((w) => (
              <Link key={w.id} href={startEtapaHref(w, project.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Iniciar {w.name}
              </Link>
            ))}
          </div>
        ) : null}

        {showAssign ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Asignar etapa</p>
            <p className="text-sm text-muted-foreground">
              {project.needsEtapa
                ? "Este proyecto no tiene etapa actual."
                : "Hay tareas sin etapa; corrígelas desde el detalle de cada tarea en «Sin etapa»."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={Object.fromEntries(workflows.map((w) => [w.id, w.name]))}
                value={assignId}
                disabled={pending}
                onValueChange={(v) => setAssignId(typeof v === "string" ? v : null)}
              >
                <SelectTrigger aria-label="Asignar etapa" className="w-full sm:w-56">
                  <SelectValue placeholder="Elige una etapa" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignEtapa && !startedIds.has(assignEtapa.id) ? (
                <Link href={startEtapaHref(assignEtapa, project.id)} className={buttonVariants({ variant: "default" })}>
                  Iniciar
                </Link>
              ) : (
                <Button disabled={!assignEtapa || pending} onClick={() => assignEtapa && setCurrent(assignEtapa.id)}>
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

import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import type { PortalProjectDTO } from "@/lib/types/portal";
import { formatDateDMY } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/** Empty state of the portal landing page (FE §3.2). */
export const PORTAL_NO_PROJECTS_MESSAGE =
  "No tienes proyectos activos. Si crees que es un error, contacta a tu equipo de Cincel.";

export function portalProjectHref(projectId: string): string {
  return `/portal/proyectos/${encodeURIComponent(projectId)}`;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * One project on the portal landing page (FE §3.2): name, code, progress, end date and the manager with a
 * mailto link. Built from `PortalProjectDTO` only; the whole card leads to the project page.
 */
export default function PortalProjectCard({ project }: { project: PortalProjectDTO }) {
  const pct = clampPct(project.progressPct);
  const href = portalProjectHref(project.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <Link href={href} className="hover:underline">
            {project.name}
          </Link>
        </CardTitle>
        {project.code ? <CardDescription>{project.code}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Avance</span>
            <span className="font-medium tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} aria-label={`Avance de ${project.name}`} />
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Fecha de término</dt>
            <dd>{project.endDate ? formatDateDMY(project.endDate) : "Sin fecha"}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">Responsable</dt>
            <dd className="min-w-0">
              {project.manager ? (
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{project.manager.name}</span>
                  {project.manager.email ? (
                    <a
                      href={`mailto:${project.manager.email}`}
                      className="inline-flex min-h-11 min-w-0 items-center gap-1.5 underline-offset-4 hover:underline"
                    >
                      <Mail aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{project.manager.email}</span>
                    </a>
                  ) : null}
                </div>
              ) : (
                "Sin asignar"
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Link
          href={href}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 w-full sm:w-auto")}
          aria-label={`Ver proyecto ${project.name}`}
        >
          Ver proyecto
          <ChevronRight aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}

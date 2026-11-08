"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import PortalProjectCard, { PORTAL_NO_PROJECTS_MESSAGE } from "@/components/portal/PortalProjectCard";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { portalHomeOptions } from "@/lib/query/options/portal";

/** Portal landing page body (FE §3.2), from `portal.projects()`: one card per project, or the empty state. */
export default function PortalHomeView() {
  const query = useQuery(portalHomeOptions());
  if (query.isError && !query.data) throw query.error;
  const projects = query.data?.projects;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Mis proyectos</h1>
      {!projects ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Cargando…
        </p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{PORTAL_NO_PROJECTS_MESSAGE}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Proyectos">
          {projects.map((project) => (
            <li key={project.id}>
              <PortalProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

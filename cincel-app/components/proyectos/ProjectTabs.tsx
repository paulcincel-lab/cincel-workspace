"use client";

import Link from "next/link";
import { ChevronLeft, Ellipsis, FolderKanban } from "lucide-react";

import {
  MOBILE_PROJECT_SECTIONS,
  ProjectSectionNav,
  projectSectionLinks,
} from "@/components/proyectos/ProjectSectionNav";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";
import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { projectMetaLine } from "@/lib/proyectos/project-summary";
import type { StaffRef, WorkflowRef } from "@/lib/types/core";
import type { ProjectRef } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

export type ProjectTabsProps = {
  /**
   * The project; the optional `projectType`, `addressCity` and `manager` feed
   * the meta line "{tipo} · {ciudad} · Responsable: {name}" (each part is left
   * out when absent).
   */
  project: ProjectRef & {
    tramo: WorkflowRef | null;
    projectType?: string | null;
    addressCity?: string | null;
    manager?: StaffRef | null;
  };
  active: "resumen" | "tareas" | "cronograma" | "archivos" | "clientes" | "ficha";
  counts: { tareas: number; archivos: number; clientes: number };
  /** `portal.manageAccess`, resolved on the server: shows the Clientes tab. */
  canManagePortal: boolean;
  /** Renders `EstiloSwitch` right-aligned under the tabs (data tabs: Resumen, Tareas, Cronograma, Archivos). */
  showEstilo?: boolean;
};

/** "Nueva tarea" opens the new-task dialog on `/tareas` with the project preset (FE §2.1, §4.5). */
export function newTaskHref(projectId: string): string {
  return `/tareas?${new URLSearchParams({ proyecto: projectId, nueva: "1" }).toString()}`;
}

/** "Reporte" → the printable Cronograma report. */
export function reportHref(projectId: string): string {
  return `/proyectos/${encodeURIComponent(projectId)}/cronograma/reporte`;
}

/**
 * Project header + tabs (redesign FE §3.5, §4.6), shared by every project tab:
 * breadcrumb "Proyectos / {name}", 48 px icon tile, name, tramo chip, meta
 * line, actions "Reporte" and "Nueva tarea", and the tabs (extends
 * `ProjectSectionNav`): Resumen, Tareas, Cronograma, Archivos, Clientes (only
 * with `portal.manageAccess`) and Ficha. On phones (frame `MovilProyecto`) the
 * breadcrumb becomes a back link, the tabs keep Resumen · Tareas · Archivos and
 * the rest move to "Más opciones".
 */
export function ProjectTabs({ project, active, counts, canManagePortal, showEstilo = false }: ProjectTabsProps) {
  const meta = projectMetaLine({
    projectType: project.projectType ?? null,
    addressCity: project.addressCity ?? null,
    manager: project.manager ?? null,
  });
  const moreLinks = projectSectionLinks(project.id, { showClientes: canManagePortal, layout: "redesign" }).filter(
    (link) => !MOBILE_PROJECT_SECTIONS.includes(link.section)
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <Breadcrumb className="hidden md:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/proyectos" />}>Proyectos</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{project.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <Link
            href="/proyectos"
            aria-label="Volver a proyectos"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "md:hidden")}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <span
            aria-hidden="true"
            className="hidden size-12 flex-none items-center justify-center rounded-xl bg-muted text-muted-foreground md:inline-flex"
          >
            <FolderKanban className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[17px] font-semibold text-foreground md:text-[22px]">{project.name}</h1>
              {project.tramo ? <TramoBadge tramo={project.tramo} variant="chip" /> : null}
            </div>
            {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Link href={reportHref(project.id)} className={buttonVariants({ variant: "outline" })}>
              Reporte
            </Link>
            <Link href={newTaskHref(project.id)} className={buttonVariants()}>
              Nueva tarea
            </Link>
          </div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Más opciones" className={buttonVariants({ variant: "ghost", size: "icon-lg" })}>
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={newTaskHref(project.id)} />}>Nueva tarea</DropdownMenuItem>
                {moreLinks.map((link) => (
                  <DropdownMenuItem key={link.section} render={<Link href={link.href} />}>
                    {link.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem render={<Link href={reportHref(project.id)} />}>Reporte</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <ProjectSectionNav
        projectId={project.id}
        layout="redesign"
        active={active}
        counts={counts}
        showClientes={canManagePortal}
      />

      {showEstilo ? (
        <div className="flex justify-end">
          <EstiloSwitch />
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, Ellipsis, Plus } from "lucide-react";

import {
  MOBILE_PROJECT_SECTIONS,
  ProjectSectionNav,
  projectSectionLinks,
} from "@/components/proyectos/ProjectSectionNav";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { PROJECT_DELETE_LABEL } from "@/components/proyectos/project-delete-copy";
import { useDeleteProject } from "@/components/proyectos/use-delete-project";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { StaffRef, WorkflowRef } from "@/lib/types/core";
import type { ProjectRef } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

export type ProjectTabsProps = {
  /**
   * The project; the optional `clientName`, `addressCity` and `endDate` feed
   * the description "{client} · {place} · entrega final {endDate}" (each part
   * is left out when absent).
   */
  project: ProjectRef & {
    tramo: WorkflowRef | null;
    projectType?: string | null;
    addressCity?: string | null;
    manager?: StaffRef | null;
    clientName?: string | null;
    endDate?: string | null;
  };
  active: "resumen" | "tareas" | "cronograma" | "archivos" | "clientes" | "ficha";
  counts: { tareas: number; archivos: number; clientes: number };
  /** `portal.manageAccess`, resolved on the server: shows the Clientes tab. */
  canManagePortal: boolean;
  /** Renders `EstiloSwitch` as the last header action (data tabs: Resumen, Tareas, Cronograma, Archivos). */
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

function subscribeToHistory(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readEstiloParam(): string | null {
  return new URLSearchParams(window.location.search).get("estilo");
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "30 abr 2027" */
function deliveryDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "{client} · {place} · entrega final {endDate}", leaving out what the project lacks. */
export function projectDescription(
  project: Pick<ProjectTabsProps["project"], "clientName" | "addressCity" | "endDate">,
): Array<{ key: string; text: string; date?: string }> {
  const parts: Array<{ key: string; text: string; date?: string }> = [];
  const client = project.clientName?.trim();
  const place = project.addressCity?.trim();
  if (client) parts.push({ key: "client", text: client });
  if (place) parts.push({ key: "place", text: place });
  if (project.endDate && /^\d{4}-\d{2}-\d{2}/.test(project.endDate)) {
    parts.push({ key: "end", text: "entrega final", date: deliveryDate(project.endDate) });
  }
  return parts;
}

/** The header's "Más opciones" menu. */
function ProjectMoreMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Más opciones" className={buttonVariants({ variant: "ghost", size: "icon-lg" })}>
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Más opciones" with "Eliminar proyecto" last (#1050), on every width, for
 * `canDeleteProject`. After the delete the page goes back to /proyectos.
 */
function ProjectDeleteMenu({ project, children }: { project: { id: string; name: string }; children: ReactNode }) {
  const router = useRouter();
  const deleteProject = useDeleteProject({ onDeleted: () => router.push("/proyectos") });
  return (
    <>
      <ProjectMoreMenu>
        {children}
        <DropdownMenuSeparator className="md:hidden" />
        <DropdownMenuItem variant="destructive" onClick={() => deleteProject.request({ id: project.id, name: project.name })}>
          {PROJECT_DELETE_LABEL}
        </DropdownMenuItem>
      </ProjectMoreMenu>
      {deleteProject.dialog}
    </>
  );
}

/**
 * Project header + tabs (Estilos header, redesign FE §3.5), shared by every
 * project tab: back link "← Proyectos" (keeps `?estilo=`), the name, the
 * description "{client} · {place} · entrega final {endDate}", actions "Nueva
 * tarea" (opens the new-task sheet with the project, only with
 * `activities.canCreateActivity`) and the Estilo switch, then the tabs
 * (extends `ProjectSectionNav`): Resumen, Tareas, Cronograma, Archivos,
 * Clientes (only with `portal.manageAccess`) and Ficha. On phones (frame
 * `MovilProyecto`) the back link is an icon, the tabs keep Resumen · Tareas ·
 * Archivos and the rest (plus "Reporte") move to "Más opciones".
 */
export function ProjectTabs({ project, active, counts, canManagePortal, showEstilo = false }: ProjectTabsProps) {
  const description = projectDescription(project);
  const user = useSessionStore(selectAuthenticatedUser);
  // No signed-in user (not yet seeded) means no create permission.
  const canCreate = useMemo(() => (user ? resolveActivitiesCapabilities(user).canCreateActivity : false), [user]);
  const openCreate = () => useNewTaskUi.getState().openNewTask({ projectId: project.id }, "proyecto");
  // "← Proyectos" keeps the `?estilo=` override of the current URL (none on the server render).
  const estilo = useSyncExternalStore(subscribeToHistory, readEstiloParam, () => null);
  const backHref = estilo ? `/proyectos?${new URLSearchParams({ estilo }).toString()}` : "/proyectos";
  const moreLinks = projectSectionLinks(project.id, { showClientes: canManagePortal }).filter(
    (link) => !MOBILE_PROJECT_SECTIONS.includes(link.section)
  );
  // "Eliminar proyecto" (#1050): with it the menu shows on every width; the other entries stay phone-only.
  const canDeleteProject = useMemo(() => (user ? resolveProjectsCapabilities(user).canDeleteProject : false), [user]);
  const phoneOnly = canDeleteProject ? "md:hidden" : undefined;
  const menuItems = (
    <>
      {canCreate ? (
        <DropdownMenuItem className={phoneOnly} onClick={openCreate}>
          Nueva tarea
        </DropdownMenuItem>
      ) : null}
      {moreLinks.map((link) => (
        <DropdownMenuItem key={link.section} className={phoneOnly} render={<Link href={link.href} />}>
          {link.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem className={phoneOnly} render={<Link href={reportHref(project.id)} />}>
        Reporte
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="hidden self-start text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:inline"
        >
          ← Proyectos
        </Link>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <Link
            href={backHref}
            aria-label="Volver a proyectos"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "md:hidden")}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-foreground md:text-[32px]">
              {project.name}
            </h1>
            {description.length > 0 ? (
              <p className="text-[15px] text-muted-foreground">
                {description.map((part, index) => (
                  <span key={part.key}>
                    {index > 0 ? " · " : null}
                    {part.text}
                    {part.date ? <span className="font-mono tabular-nums"> {part.date}</span> : null}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canCreate ? (
              <Button type="button" onClick={openCreate} className="hidden md:inline-flex">
                <Plus data-icon="inline-start" aria-hidden="true" />
                Nueva tarea
              </Button>
            ) : null}
            {showEstilo ? <EstiloSwitch /> : null}
          </div>
          {canDeleteProject ? (
            <ProjectDeleteMenu project={project}>{menuItems}</ProjectDeleteMenu>
          ) : (
            <div className="md:hidden">
              <ProjectMoreMenu>{menuItems}</ProjectMoreMenu>
            </div>
          )}
        </div>
      </header>

      <ProjectSectionNav
        projectId={project.id}
        active={active}
        counts={counts}
        showClientes={canManagePortal}
      />
    </div>
  );
}

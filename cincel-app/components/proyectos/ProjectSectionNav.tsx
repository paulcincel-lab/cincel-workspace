"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities } from "@/lib/auth/permissions";
import { useSessionStore } from "@/lib/stores/session-store";

export type ProjectSection = "resumen" | "tareas" | "ficha" | "cronograma" | "archivos" | "clientes";

/** Tab counts of the redesigned shell (redesign FE §3.5). */
export type ProjectSectionCounts = { tareas: number; archivos: number; clientes: number };

export type ProjectSectionLink = { section: ProjectSection; label: string; href: string; count?: number };

/** `legacy`: today's Ficha · Cronograma · Archivos · Clientes; `redesign`: the `ProjectTabs` set (FE §3.5). */
export type ProjectSectionLayout = "legacy" | "redesign";

const SECTION_LABELS: Record<ProjectSection, string> = {
  resumen: "Resumen",
  tareas: "Tareas",
  ficha: "Ficha",
  cronograma: "Cronograma",
  archivos: "Archivos",
  clientes: "Clientes",
};

/** Tabs the redesigned shell keeps on phones (frame `MovilProyecto`); the rest move to the "Más opciones" menu. */
export const MOBILE_PROJECT_SECTIONS: readonly ProjectSection[] = ["resumen", "tareas", "archivos"];

/**
 * Tabs shown for a project, in order. Clientes needs `portal.manageAccess`, the capability the Clientes page and its
 * actions check on the server. The redesign layout adds Resumen (the project's base URL) and Tareas, puts Ficha
 * last and carries the counts of Tareas, Archivos and Clientes.
 */
export function projectSectionLinks(
  projectId: string,
  {
    showClientes = false,
    layout = "legacy",
    counts,
  }: { showClientes?: boolean; layout?: ProjectSectionLayout; counts?: ProjectSectionCounts } = {}
): ProjectSectionLink[] {
  const base = `/proyectos/${encodeURIComponent(projectId)}`;
  if (layout === "legacy") {
    const sections: ProjectSection[] = ["ficha", "cronograma", "archivos", ...(showClientes ? ["clientes" as const] : [])];
    return sections.map((section) => ({ section, label: SECTION_LABELS[section], href: `${base}/${section}` }));
  }
  const sections: ProjectSection[] = [
    "resumen",
    "tareas",
    "cronograma",
    "archivos",
    ...(showClientes ? ["clientes" as const] : []),
    "ficha",
  ];
  return sections.map((section) => {
    const count = section === "tareas" || section === "archivos" || section === "clientes" ? counts?.[section] : undefined;
    return {
      section,
      label: SECTION_LABELS[section],
      href: section === "resumen" ? base : `${base}/${section}`,
      ...(count !== undefined ? { count } : {}),
    };
  });
}

/**
 * Section of `/proyectos/[id]/<section>/...`; nested pages (e.g. cronograma/reporte) keep their parent tab. The bare
 * project URL is Resumen.
 */
export function activeProjectSection(pathname: string | null): ProjectSection | null {
  const path = pathname ?? "";
  if (/^\/proyectos\/[^/?#]+\/?$/.test(path)) return "resumen";
  const match = /^\/proyectos\/[^/]+\/([^/?#]+)/.exec(path);
  const section = match?.[1];
  return section && section in SECTION_LABELS ? (section as ProjectSection) : null;
}

/** Whether the signed-in staff member has `portal.manageAccess` (re-read when the session store changes). */
function useCanManagePortalAccess(): boolean {
  const access = useSessionStore((state) => state.access);
  return access.status === "active" && resolvePortalCapabilities(getCurrentAuthenticatedUser()).manageAccess;
}

/**
 * `showClientes` overrides the capability check (the Clientes page passes what the server resolved). `layout="redesign"`
 * renders the `ProjectTabs` set with counts; `active` then comes from the page instead of the path.
 */
export function ProjectSectionNav({
  projectId,
  showClientes,
  layout = "legacy",
  active: activeProp,
  counts,
}: {
  projectId: string;
  showClientes?: boolean;
  layout?: ProjectSectionLayout;
  active?: ProjectSection;
  counts?: ProjectSectionCounts;
}) {
  const pathname = usePathname();
  const active = activeProp ?? activeProjectSection(pathname);
  const canManagePortalAccess = useCanManagePortalAccess();
  const links = projectSectionLinks(projectId, { showClientes: showClientes ?? canManagePortalAccess, layout, counts });
  const redesign = layout === "redesign";

  return (
    <nav aria-label="Secciones del proyecto" className={redesign ? undefined : "mb-6"}>
      <Tabs value={active}>
        <TabsList variant="line" className={redesign ? "max-w-full" : undefined}>
          {links.map((link) => (
            <TabsTrigger
              key={link.section}
              value={link.section}
              nativeButton={false}
              className={redesign && !MOBILE_PROJECT_SECTIONS.includes(link.section) ? "hidden md:inline-flex" : undefined}
              render={<Link href={link.href} aria-current={link.section === active ? "page" : undefined} />}
            >
              {link.label}
              {link.count !== undefined ? (
                <span className="font-mono text-xs text-muted-foreground">{link.count}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

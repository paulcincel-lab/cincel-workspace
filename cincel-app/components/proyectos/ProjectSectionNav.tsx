"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities } from "@/lib/auth/permissions";
import { useSessionStore } from "@/lib/stores/session-store";

export type ProjectSection = "resumen" | "tareas" | "ficha" | "cronograma" | "archivos" | "clientes";

/** Tab counts of the project shell (redesign FE §3.5). */
export type ProjectSectionCounts = { tareas: number; archivos: number; clientes: number };

export type ProjectSectionLink = { section: ProjectSection; label: string; href: string; count?: number };

const SECTION_LABELS: Record<ProjectSection, string> = {
  resumen: "Resumen",
  tareas: "Tareas",
  ficha: "Ficha",
  cronograma: "Cronograma",
  archivos: "Archivos",
  clientes: "Clientes",
};

/** Tabs the project shell keeps on phones (frame `MovilProyecto`); the rest move to the "Más opciones" menu. */
export const MOBILE_PROJECT_SECTIONS: readonly ProjectSection[] = ["resumen", "tareas", "archivos"];

/**
 * Tabs shown for a project, in order (FE §3.5): Resumen (the project's base URL), Tareas, Cronograma, Archivos,
 * Clientes and Ficha last, with the counts of Tareas, Archivos and Clientes. Clientes needs `portal.manageAccess`,
 * the capability the Clientes page and its actions check on the server.
 */
export function projectSectionLinks(
  projectId: string,
  { showClientes = false, counts }: { showClientes?: boolean; counts?: ProjectSectionCounts } = {}
): ProjectSectionLink[] {
  const base = `/proyectos/${encodeURIComponent(projectId)}`;
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
 * The `ProjectTabs` tab row with counts. `showClientes` overrides the capability check (the Clientes page passes what
 * the server resolved); `active` comes from the page, else from the path.
 */
export function ProjectSectionNav({
  projectId,
  showClientes,
  active: activeProp,
  counts,
}: {
  projectId: string;
  showClientes?: boolean;
  active?: ProjectSection;
  counts?: ProjectSectionCounts;
}) {
  const pathname = usePathname();
  const active = activeProp ?? activeProjectSection(pathname);
  const canManagePortalAccess = useCanManagePortalAccess();
  const links = projectSectionLinks(projectId, { showClientes: showClientes ?? canManagePortalAccess, counts });

  return (
    <nav aria-label="Secciones del proyecto">
      <Tabs value={active}>
        <TabsList variant="line" className="max-w-full">
          {links.map((link) => (
            <TabsTrigger
              key={link.section}
              value={link.section}
              nativeButton={false}
              className={MOBILE_PROJECT_SECTIONS.includes(link.section) ? undefined : "hidden md:inline-flex"}
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

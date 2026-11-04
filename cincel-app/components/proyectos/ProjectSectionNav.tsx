"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";

export type ProjectSection = "ficha" | "cronograma" | "archivos" | "clientes";

export type ProjectSectionLink = { section: ProjectSection; label: string; href: string };

const SECTION_LABELS: Record<ProjectSection, string> = {
  ficha: "Ficha",
  cronograma: "Cronograma",
  archivos: "Archivos",
  clientes: "Clientes",
};

/**
 * Tabs shown for a project, in order. Clientes needs `portal.manageAccess`; callers keep it off until the Clientes
 * page ships with Client Portal Phase 1.
 */
export function projectSectionLinks(projectId: string, { showClientes = false } = {}): ProjectSectionLink[] {
  const sections: ProjectSection[] = ["ficha", "cronograma", "archivos", ...(showClientes ? ["clientes" as const] : [])];
  const base = `/proyectos/${encodeURIComponent(projectId)}`;
  return sections.map((section) => ({ section, label: SECTION_LABELS[section], href: `${base}/${section}` }));
}

/** Section of `/proyectos/[id]/<section>/...`; nested pages (e.g. cronograma/reporte) keep their parent tab. */
export function activeProjectSection(pathname: string | null): ProjectSection | null {
  const match = /^\/proyectos\/[^/]+\/([^/?#]+)/.exec(pathname ?? "");
  const section = match?.[1];
  return section && section in SECTION_LABELS ? (section as ProjectSection) : null;
}

export function ProjectSectionNav({ projectId, showClientes = false }: { projectId: string; showClientes?: boolean }) {
  const pathname = usePathname();
  const active = activeProjectSection(pathname);
  const links = projectSectionLinks(projectId, { showClientes });

  return (
    <nav aria-label="Secciones del proyecto" className="mb-6">
      <Tabs value={active}>
        <TabsList variant="line">
          {links.map((link) => (
            <TabsTrigger
              key={link.section}
              value={link.section}
              nativeButton={false}
              render={<Link href={link.href} aria-current={link.section === active ? "page" : undefined} />}
            >
              {link.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

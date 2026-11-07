"use client";

import { useMemo, useState } from "react";

import { useRecentDocuments } from "@/components/biblioteca/use-recent-documents";
import { recentDocumentsToShow } from "@/components/recursos/resources-model";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader } from "@/components/shell/PageHeader";
import { Input } from "@/components/ui/shadcn/input";
import { EntityCardGrid } from "@/components/widgets/EntityCardGrid";
import {
  buildBibliotecaGroups,
  recentDocumentHref,
  recurso,
  shortDate,
} from "@/lib/biblioteca/catalog";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";
import type { EntityCard, RecordTableData } from "@/lib/types/widgets";

export type BibliotecaIndexProps = {
  /** The viewer's visible resource links (filtered on the server). */
  links: ResourceLink[];
  /** False when the viewer can't see Empresa (`enterprise.canView`). */
  showEmpresa?: boolean;
};

function sectionName(section: ResourceSection): string {
  return section === "empresa" ? "Empresa" : (recurso(section)?.title ?? section);
}

const RECENT_COLUMNS: RecordTableData["columns"] = [
  { key: "documento", label: "Documento" },
  { key: "seccion", label: "Sección" },
  { key: "abierto", label: "Abierto", format: "date" },
];

/**
 * `/biblioteca` index (redesign FE §3.7, frames `Biblioteca`,
 * `BibliotecaEsencial`, `BibliotecaAnalitico`): evolves the Recursos
 * workspace overview onto `EntityCardGrid`. Groups "Abiertos recientemente"
 * (the workspace's localStorage list, unchanged), Empresa and Recursos; each
 * card carries its count and last update and the Analítico catalog table
 * (Sección, Documentos, Actualizado). The widget renders each style; no views
 * or downloads columns (RD-7).
 */
export function BibliotecaIndex({ links, showEmpresa = true }: BibliotecaIndexProps) {
  const [query, setQuery] = useState("");
  const recentStored = useRecentDocuments();

  const groups = useMemo(() => buildBibliotecaGroups(links, { showEmpresa, query }), [links, showEmpresa, query]);

  const recent = useMemo(() => {
    const docs = recentDocumentsToShow(recentStored, links);
    const items: EntityCard[] = docs.map((doc) => ({
      id: `reciente:${doc.id}`,
      title: doc.title,
      subtitle: [sectionName(doc.section), shortDate(doc.openedAt)].filter(Boolean).join(" · "),
      href: recentDocumentHref(links, doc),
      iconName: "file-text",
    }));
    const table: RecordTableData = {
      columns: RECENT_COLUMNS,
      rows: docs.map((doc) => ({
        id: `reciente:${doc.id}`,
        href: recentDocumentHref(links, doc),
        documento: doc.title,
        seccion: sectionName(doc.section),
        abierto: doc.openedAt,
      })),
    };
    return { items, table };
  }, [recentStored, links]);

  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Biblioteca"
        description="Recursos y documentos de la empresa en un solo lugar."
        actions={
          <>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en la biblioteca"
              aria-label="Buscar en la biblioteca"
              className="w-full sm:w-72"
            />
            <EstiloSwitch />
          </>
        }
      />

      {searching ? null : (
        <section aria-labelledby="biblioteca-recientes" className="flex flex-col gap-2">
          <h2 id="biblioteca-recientes" className="text-sm font-medium text-foreground">
            Abiertos recientemente
          </h2>
          <EntityCardGrid
            items={recent.items}
            table={recent.table}
            minWidth={220}
            emptyState={{ title: "Aún no has abierto documentos.", description: "Abre un documento de Google para verlo aquí." }}
          />
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`biblioteca-${group.key}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`biblioteca-${group.key}`} className="text-sm font-medium text-foreground">
              {group.title}
            </h2>
            <span className="text-xs text-muted-foreground">{group.caption}</span>
          </div>
          <EntityCardGrid
            items={group.cards}
            table={group.table}
            minWidth={240}
            emptyState={{
              title: "Sin resultados",
              description: searching
                ? `Nada en ${group.title} coincide con “${query.trim()}”.`
                : `Aún no hay documentos en ${group.title}.`,
            }}
          />
        </section>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";

interface RecursosV2ClientProps {
  initialLinks: ResourceLink[];
}

const SECTION_LABEL: Record<ResourceSection, string> = {
  "mis-documentos": "Mis documentos",
  "mis-favoritos": "Favoritos",
  "plantillas-diseno": "Plantillas",
  "formatos-obra": "Formatos de obra",
  "mis-vacaciones": "Vacaciones",
  formacion: "Formación",
  empresa: "Empresa",
};

const LINK_TYPE_LABEL: Record<ResourceLink["linkType"], string> = {
  drive_folder: "Carpeta",
  drive_file: "Archivo",
  web: "Enlace",
};

const SECTIONS = Object.keys(SECTION_LABEL) as ResourceSection[];

/**
 * Was 6 separate routes (app/recursos/{mis-documentos,mis-favoritos,...})
 * each filtering the same `resource_links` table server-side by `section`.
 * v2 fetches once and filters client-side via tabs — one Drive view instead
 * of six navigations.
 */
export function RecursosV2Client({ initialLinks }: RecursosV2ClientProps) {
  const [section, setSection] = useState<"Todo" | ResourceSection>("Todo");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const visible = useMemo(
    () => (section === "Todo" ? initialLinks : initialLinks.filter((l) => l.section === section)),
    [initialLinks, section]
  );

  function toggle(id: string | number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: (string | number)[]) {
    setSelected((cur) => {
      const allSelected = ids.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function bulkCopyLinks() {
    const text = initialLinks
      .filter((l) => selected.has(l.id))
      .map((l) => l.url)
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  const columns = useMemo<ColumnDef<ResourceLink, unknown>[]>(
    () => [
      createSelectionColumn<ResourceLink>({
        getId: (l) => l.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      {
        accessorKey: "title",
        header: "Nombre",
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: "linkType",
        header: "Tipo",
        cell: ({ row }) => <Badge variant="secondary">{LINK_TYPE_LABEL[row.original.linkType]}</Badge>,
      },
      {
        accessorKey: "updatedAt",
        header: "Modificado",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.updatedAt).toLocaleDateString("es-MX")}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "vigente" ? "outline" : "secondary"}>
            {row.original.status === "vigente" ? "vigente" : "obsoleto"}
          </Badge>
        ),
      },
      createRowActionsColumn<ResourceLink>(() => [
        { label: "Abrir", onSelect: (l) => window.open(l.url, "_blank", "noopener") },
      ]),
    ],
    [selected]
  );

  return (
    <div>
      <PageHeader
        title="Recursos"
        description="Acceso rápido a las áreas de recursos del despacho."
        actions={
          <Tabs
            value={section}
            onValueChange={(v) => {
              setSection(v as typeof section);
              setSelected(new Set());
            }}
          >
            <TabsList>
              <TabsTrigger value="Todo">Todo</TabsTrigger>
              {SECTIONS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {SECTION_LABEL[s]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <BulkActionBar
        selectedCount={selected.size}
        itemLabel="recursos"
        actions={[{ label: "Copiar enlaces", onClick: bulkCopyLinks }]}
      />
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar carpeta o recurso…"
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage="No hay recursos en esta vista."
      />
    </div>
  );
}

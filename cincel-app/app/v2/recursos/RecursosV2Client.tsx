"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
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

  const visible = useMemo(
    () => (section === "Todo" ? initialLinks : initialLinks.filter((l) => l.section === section)),
    [initialLinks, section]
  );

  const columns = useMemo<ColumnDef<ResourceLink, unknown>[]>(
    () => [
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
    []
  );

  return (
    <div>
      <PageHeader
        title="Recursos"
        description="Acceso rápido a las áreas de recursos del despacho."
        actions={
          <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)}>
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

      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar carpeta o recurso…"
        emptyMessage="No hay recursos en esta vista."
      />
    </div>
  );
}

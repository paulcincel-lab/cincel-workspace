"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { CONTACT_TYPES, type ContactType } from "@/lib/types/enums";
import { directorioStatusVariant, type DirectorioRow } from "@/lib/directorio/types";

interface DirectorioV2ClientProps {
  initialRows: DirectorioRow[];
}

const FILTERS: Array<"Todos" | ContactType> = ["Todos", ...CONTACT_TYPES];

export function DirectorioV2Client({ initialRows }: DirectorioV2ClientProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");

  const visible = useMemo(
    () => (filter === "Todos" ? initialRows : initialRows.filter((r) => r.type === filter)),
    [initialRows, filter]
  );

  const columns = useMemo<ColumnDef<DirectorioRow, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Nombre", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => <Badge variant="secondary">{row.original.type}</Badge>,
      },
      { accessorKey: "category", header: "Categoría" },
      { accessorKey: "contact", header: "Contacto", cell: ({ row }) => <span className="text-muted-foreground">{row.original.contact}</span> },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={directorioStatusVariant(row.original.status)}>{row.original.status}</Badge>
        ),
      },
    ],
    []
  );

  return (
    <div>
      <PageHeader
        title="Directorio"
        description="Clientes, contratistas, colaboradores y tiendas — todo en un lugar."
        actions={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f}
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
        searchPlaceholder="Buscar en el directorio…"
        emptyMessage="No hay contactos para este filtro."
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { CONTACT_TYPES, type ContactType } from "@/lib/types/enums";
import { directorioStatusVariant, type DirectorioRow } from "@/lib/directorio/types";

interface DirectorioV2ClientProps {
  initialRows: DirectorioRow[];
}

const FILTERS: Array<"Todos" | ContactType> = ["Todos", ...CONTACT_TYPES];

export function DirectorioV2Client({ initialRows }: DirectorioV2ClientProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const visible = useMemo(
    () => (filter === "Todos" ? initialRows : initialRows.filter((r) => r.type === filter)),
    [initialRows, filter]
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

  function bulkCopyContacts() {
    const text = initialRows
      .filter((r) => selected.has(r.id))
      .map((r) => `${r.name} — ${r.contact}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  const columns = useMemo<ColumnDef<DirectorioRow, unknown>[]>(
    () => [
      createSelectionColumn<DirectorioRow>({
        getId: (r) => r.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
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
    [selected]
  );

  return (
    <div>
      <PageHeader
        title="Directorio"
        description="Clientes, contratistas, colaboradores y tiendas — todo en un lugar."
        actions={
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as typeof filter);
              setSelected(new Set());
            }}
          >
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

      <BulkActionBar
        selectedCount={selected.size}
        itemLabel="contactos"
        actions={[{ label: "Copiar contactos", onClick: bulkCopyContacts }]}
      />
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar en el directorio…"
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage="No hay contactos para este filtro."
      />
    </div>
  );
}

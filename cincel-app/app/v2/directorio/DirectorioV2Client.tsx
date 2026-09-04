"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { CONTACT_TYPES, type ContactType } from "@/lib/types/enums";
import { directorioStatusVariant, toDirectorioRows, type DirectorioRow } from "@/lib/directorio/types";
import { saveClients, type ManualClient } from "@/lib/repositories/clients-repository";
import {
  saveColaboradores,
  saveContractors,
  saveTiendas,
  type Colaborador,
  type Contractor,
  type Tienda,
} from "@/lib/repositories/providers-repository";

interface DirectorioV2ClientProps {
  initialClients: ManualClient[];
  initialContractors: Contractor[];
  initialColaboradores: Colaborador[];
  initialTiendas: Tienda[];
}

const FILTERS: Array<"Todos" | ContactType> = ["Todos", ...CONTACT_TYPES];

function nextId(items: Array<{ id: number }>): number {
  return Math.max(0, ...items.map((i) => i.id)) + 1;
}

type Draft = {
  type: ContactType;
  name: string;
  contact: string;
  category: string; // Especialidad (Contratista) / Puesto (Colaborador) — unused for Cliente/Tienda
  kind: "Empresa" | "Particular"; // Cliente only
  tiendaType: "Física" | "Online" | "Híbrida"; // Tienda only
};

const emptyDraft: Draft = {
  type: "Cliente",
  name: "",
  contact: "",
  category: "",
  kind: "Particular",
  tiendaType: "Física",
};

export function DirectorioV2Client({
  initialClients,
  initialContractors,
  initialColaboradores,
  initialTiendas,
}: DirectorioV2ClientProps) {
  const [clients, setClients] = useState(initialClients);
  const [contractors, setContractors] = useState(initialContractors);
  const [colaboradores, setColaboradores] = useState(initialColaboradores);
  const [tiendas, setTiendas] = useState(initialTiendas);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const rows = useMemo(
    () => toDirectorioRows({ clients, contractors, colaboradores, tiendas }),
    [clients, contractors, colaboradores, tiendas]
  );

  const visible = useMemo(
    () => (filter === "Todos" ? rows : rows.filter((r) => r.type === filter)),
    [rows, filter]
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
    const text = rows
      .filter((r) => selected.has(r.id))
      .map((r) => `${r.name} — ${r.contact}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  async function createContact() {
    const name = draft.name.trim();
    if (!name) return;

    switch (draft.type) {
      case "Cliente": {
        const created: ManualClient = {
          id: nextId(clients),
          name,
          emails: draft.contact.includes("@") ? [draft.contact.trim()] : [],
          phone: draft.contact.includes("@") ? "" : draft.contact.trim(),
          kind: draft.kind,
          contacts: [],
          completedProjects: [],
          acquisitionChannel: "Sin registro",
          totalSpent: 0,
          hasActiveProject: false,
          projectName: "",
          projectType: "",
          totalProjectsWorked: 0,
          firstWorkDate: "",
        };
        const next = [...clients, created];
        setClients(next);
        await saveClients(next);
        break;
      }
      case "Contratista": {
        const created: Contractor = {
          id: nextId(contractors),
          provider: name,
          status: "Prospecto",
          categories: [],
          mainSpecialty: draft.category.trim(),
          seniority: "Nivel Medio",
          priceLevel: "Nivel Medio",
          rating: 0,
          contact: draft.contact.trim() || undefined,
        };
        const next = [...contractors, created];
        setContractors(next);
        await saveContractors(next);
        break;
      }
      case "Colaborador": {
        const created: Colaborador = {
          id: nextId(colaboradores),
          name,
          role: draft.category.trim() as Colaborador["role"],
          status: "Activo",
          rating: 0,
          contact: draft.contact.trim() || undefined,
        };
        const next = [...colaboradores, created];
        setColaboradores(next);
        await saveColaboradores(next);
        break;
      }
      case "Tienda": {
        const created: Tienda = {
          id: nextId(tiendas),
          name,
          status: "Activa",
          type: draft.tiendaType,
          rating: 0,
          contact: draft.contact.trim() || undefined,
        };
        const next = [...tiendas, created];
        setTiendas(next);
        await saveTiendas(next);
        break;
      }
    }

    setCreateOpen(false);
    setDraft(emptyDraft);
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
          <>
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
            <Button onClick={() => setCreateOpen(true)}>+ Nuevo contacto</Button>
          </>
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

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nuevo contacto</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div>
              <Label className="mb-2 block">Tipo de contacto</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft((d) => ({ ...d, type: v as ContactType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Nombre</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={draft.type === "Cliente" ? "Familia Gómez" : "Nombre o razón social"}
              />
            </div>

            <div>
              <Label className="mb-2 block">Contacto (correo o teléfono)</Label>
              <Input
                value={draft.contact}
                onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
                placeholder="contacto@correo.mx"
              />
            </div>

            {draft.type === "Cliente" ? (
              <div>
                <Label className="mb-2 block">Tipo</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as Draft["kind"] }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Particular">Particular</SelectItem>
                    <SelectItem value="Empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {draft.type === "Contratista" || draft.type === "Colaborador" ? (
              <div>
                <Label className="mb-2 block">{draft.type === "Contratista" ? "Especialidad principal" : "Puesto"}</Label>
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  placeholder={draft.type === "Contratista" ? "Mobiliario Habitacional" : "Arquitecto"}
                />
              </div>
            ) : null}

            {draft.type === "Tienda" ? (
              <div>
                <Label className="mb-2 block">Tipo de tienda</Label>
                <Select
                  value={draft.tiendaType}
                  onValueChange={(v) => setDraft((d) => ({ ...d, tiendaType: v as Draft["tiendaType"] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Física">Física</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Híbrida">Híbrida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createContact} disabled={!draft.name.trim()}>
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import ExportMenu from "@/components/ui/ExportMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { EditableCell } from "@/components/proveedores/EditableCell";
import { StarRating } from "@/components/proveedores/StarRating";
import {
  ContactEditorSheet,
  draftToContactInput,
  emptyContactDraft,
  type ContactDraft,
} from "@/components/directorio/ContactEditorSheet";
import { ClientDetailSheet } from "@/components/directorio/ClientDetailSheet";
import {
  CONTACT_TYPE_LABEL,
  PROVIDER_STATUS_LABEL,
  toDirectorioRows,
  type DirectorioRow,
} from "@/lib/directorio/types";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import {
  createContactAction,
  deleteContactAction,
  fetchContactAction,
  fetchContactsAction,
  updateContactAction,
} from "@/lib/actions/contacts-actions";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import type { ContactDetail, ContactListItem, ContactType, ProviderStatus, ProviderSubtype } from "@/lib/types/core";

interface DirectorioClientProps {
  initialContacts: ContactListItem[];
}

const TYPE_FILTERS: Array<"Todos" | ContactType> = ["Todos", "cliente", "socio", "proveedor"];
const PROVIDER_SUBTYPES: ProviderSubtype[] = ["contratista", "colaborador", "tienda"];
const PROVIDER_SUBTYPE_LABEL: Record<ProviderSubtype, string> = {
  contratista: "Contratista",
  colaborador: "Colaborador",
  tienda: "Tienda",
};
const PROVIDER_STATUSES: ProviderStatus[] = ["activo", "inactivo", "pausado", "prospecto", "lista_negra"];

const RATING_FILTER_OPTIONS = [
  { value: "0", label: "Calificación: Todas" },
  { value: "5", label: "★★★★★  5 estrellas" },
  { value: "4", label: "★★★★+  4 o más" },
  { value: "3", label: "★★★+  3 o más" },
  { value: "2", label: "★★+  2 o más" },
];

const emptyFilters = { subtype: "" as ProviderSubtype | "", status: "" as ProviderStatus | "", minRating: 0 };

const COLUMN_ORDER_STORAGE_KEY = "cincel.directorio.column.order.v1";
type ColumnKey = "name" | "type" | "category" | "contact" | "status" | "rating";
const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["name", "type", "category", "contact", "status", "rating"];
const COLUMN_LABEL: Record<ColumnKey, string> = {
  name: "Nombre",
  type: "Tipo",
  category: "Categoría",
  contact: "Contacto",
  status: "Estado",
  rating: "Calificación",
};

function loadColumnOrder(): ColumnKey[] {
  const stored = readStorage(COLUMN_ORDER_STORAGE_KEY);
  if (!stored) return DEFAULT_COLUMN_ORDER;
  try {
    const parsed = JSON.parse(stored) as ColumnKey[];
    if (!Array.isArray(parsed)) return DEFAULT_COLUMN_ORDER;
    const known = parsed.filter((key): key is ColumnKey => DEFAULT_COLUMN_ORDER.includes(key));
    const missing = DEFAULT_COLUMN_ORDER.filter((key) => !known.includes(key));
    return [...known, ...missing];
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
}

function draftFromDetail(detail: ContactDetail): ContactDraft {
  const provider = detail.providerProfile;
  return {
    ...emptyContactDraft,
    type: detail.type,
    kind: detail.kind,
    name: detail.name,
    phone: detail.phone ?? "",
    email: detail.email ?? "",
    website: detail.website ?? "",
    location: detail.location ?? "",
    acquisitionChannel: detail.acquisitionChannel ?? "",
    notes: detail.notes ?? "",
    people: detail.people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      isPrimary: p.isPrimary,
    })),
    categoriaTagsText: detail.tags.filter((t) => t.kind === "categoria").map((t) => t.value).join(", "),
    habilidadTagsText: detail.tags.filter((t) => t.kind === "habilidad").map((t) => t.value).join(", "),
    providerSubtype: provider?.subtype ?? "contratista",
    providerStatus: provider?.status ?? "activo",
    mainSpecialty: provider?.mainSpecialty ?? "",
    department: provider?.department ?? "",
    seniority: provider?.seniority ?? "",
    priceLevel: provider?.priceLevel ?? "",
    availability: provider?.availability ?? "",
    comments: provider?.comments ?? "",
    rating: provider?.rating ?? 0,
    startDate: provider?.startDate ?? "",
    staffId: provider?.staffId ?? null,
  };
}

export function DirectorioClient({ initialContacts }: DirectorioClientProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("Todos");
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [formError, setFormError] = useState("");

  const searchParams = useSearchParams();
  const [detailContactId, setDetailContactId] = useState<string | null>(() => searchParams.get("cliente"));
  const [detailContact, setDetailContact] = useState<ContactDetail | null>(null);

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => loadColumnOrder());
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);

  const reorderColumn = (sourceKey: ColumnKey, targetKey: ColumnKey) => {
    const sourceIdx = columnOrder.indexOf(sourceKey);
    const targetIdx = columnOrder.indexOf(targetKey);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

    const newOrder = [...columnOrder];
    newOrder.splice(sourceIdx, 1);
    const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
    newOrder.splice(adjustedTargetIdx, 0, sourceKey);

    setColumnOrder(newOrder);
    writeStorage(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(newOrder));
  };

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const clientsCapabilities = useMemo(() => resolveClientsCapabilities(authenticatedUser), [authenticatedUser]);

  useEffect(() => {
    if (!detailContactId) return;
    let cancelled = false;
    void fetchContactAction(detailContactId).then((c) => {
      if (!cancelled) setDetailContact(c);
    });
    return () => {
      cancelled = true;
    };
  }, [detailContactId]);

  const activeDetailContact = detailContactId && detailContact?.id === detailContactId ? detailContact : null;

  async function refreshContacts() {
    const next = await fetchContactsAction();
    setContacts(next);
  }

  const rows = useMemo(() => toDirectorioRows(contacts), [contacts]);

  const visible = useMemo(() => {
    return rows
      .filter((r) => typeFilter === "Todos" || r.type === typeFilter)
      .filter((r) => {
        if (!filters.subtype) return true;
        const contact = contacts.find((c) => c.id === r.id);
        return contact?.providerProfile?.subtype === filters.subtype;
      })
      .filter((r) => {
        if (!filters.status) return true;
        const contact = contacts.find((c) => c.id === r.id);
        return contact?.providerProfile?.status === filters.status;
      })
      .filter((r) => filters.minRating === 0 || (r.rating ?? 0) >= filters.minRating);
  }, [rows, contacts, typeFilter, filters]);

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

  function openCreate() {
    setFormError("");
    setEditingId(null);
    setDraft({ ...emptyContactDraft, type: typeFilter === "Todos" ? "cliente" : typeFilter });
    setShowEditor(true);
  }

  async function openEdit(row: DirectorioRow) {
    setFormError("");
    const detail = await fetchContactAction(row.id);
    if (!detail) return;
    setEditingId(row.id);
    setDraft(draftFromDetail(detail));
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setFormError("");
  }

  async function saveDraft() {
    const name = draft.name.trim();
    if (!name) {
      setFormError("El nombre es obligatorio.");
      return;
    }

    try {
      const input = draftToContactInput(draft);
      if (editingId !== null) {
        await updateContactAction(editingId, input);
      } else {
        await createContactAction(input);
      }
      await refreshContacts();
      if (editingId !== null && detailContactId === editingId) {
        setDetailContact(await fetchContactAction(editingId));
      }
      setShowEditor(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el contacto.");
    }
  }

  async function deleteRow(row: DirectorioRow) {
    if (!window.confirm(`¿Eliminar "${row.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteContactAction(row.id);
      await refreshContacts();
      if (detailContactId === row.id) setDetailContactId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo eliminar el contacto.");
    }
  }

  async function updateProviderField(id: string, patch: Partial<NonNullable<ContactListItem["providerProfile"]>>) {
    const contact = contacts.find((c) => c.id === id);
    if (!contact?.providerProfile) return;
    await updateContactAction(id, { providerProfile: { ...contact.providerProfile, ...patch } });
    await refreshContacts();
  }

  const exportColumns = useMemo<ExportColumn<DirectorioRow>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (r) => r.name },
      { key: "type", header: "Tipo", getValue: (r) => CONTACT_TYPE_LABEL[r.type] },
      { key: "category", header: "Categoría", getValue: (r) => r.category },
      { key: "contact", header: "Contacto", getValue: (r) => r.contact },
      { key: "status", header: "Estado", getValue: (r) => r.status },
      { key: "rating", header: "Calificación", getValue: (r) => r.rating ?? "" },
    ],
    []
  );

  async function exportDirectorio(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: "Directorio",
      fileName: `directorio-${typeFilter}-${Date.now()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: exportColumns,
      rows: visible,
      landscape: true,
    });
  }

  const activeFiltersCount = [filters.subtype, filters.status, filters.minRating > 0].filter(Boolean).length;

  const draggableHeader = (key: ColumnKey) => (
    <div
      draggable
      onDragStart={() => setDraggedColumn(key)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (draggedColumn) reorderColumn(draggedColumn, key);
        setDraggedColumn(null);
      }}
      onDragEnd={() => setDraggedColumn(null)}
      className={`cursor-move ${draggedColumn === key ? "text-primary" : ""}`}
      title="Arrastra para reordenar"
    >
      {COLUMN_LABEL[key]}
    </div>
  );

  const dataColumnsByKey = useMemo<Record<ColumnKey, ColumnDef<DirectorioRow, unknown>>>(
    () => ({
      name: {
        id: "name",
        accessorKey: "name",
        header: () => draggableHeader("name"),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      type: {
        id: "type",
        accessorKey: "type",
        header: () => draggableHeader("type"),
        cell: ({ row }) => <Badge variant="secondary">{CONTACT_TYPE_LABEL[row.original.type]}</Badge>,
      },
      category: {
        id: "category",
        accessorKey: "category",
        header: () => draggableHeader("category"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.type !== "proveedor") return <span>{r.category}</span>;
          return (
            <EditableCell
              value={r.category}
              onSave={(v) => void updateProviderField(r.id, { mainSpecialty: v })}
            />
          );
        },
      },
      contact: {
        id: "contact",
        accessorKey: "contact",
        header: () => draggableHeader("contact"),
        cell: ({ row }) => {
          const r = row.original;
          return <EditableCell value={r.contact === "—" ? "" : r.contact} onSave={(v) => void updateContactAction(r.id, { phone: v }).then(refreshContacts)} />;
        },
      },
      status: {
        id: "status",
        accessorKey: "status",
        header: () => draggableHeader("status"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.type !== "proveedor") return <span className="text-muted-foreground">—</span>;
          return (
            <Select
              value={contacts.find((c) => c.id === r.id)?.providerProfile?.status ?? "activo"}
              onValueChange={(v) => void updateProviderField(r.id, { status: v as ProviderStatus })}
            >
              <SelectTrigger className="h-auto border-0 bg-transparent px-1 py-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROVIDER_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        },
      },
      rating: {
        id: "rating",
        accessorKey: "rating",
        header: () => draggableHeader("rating"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.type !== "proveedor") return <span className="text-muted-foreground">—</span>;
          return <StarRating rating={r.rating ?? 0} onRate={(v) => void updateProviderField(r.id, { rating: v })} />;
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggedColumn, contacts]
  );

  const columns = useMemo<ColumnDef<DirectorioRow, unknown>[]>(
    () => [
      createSelectionColumn<DirectorioRow>({
        getId: (r) => r.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      ...columnOrder.map((key) => dataColumnsByKey[key]),
      createRowActionsColumn<DirectorioRow>((row) => {
        const isCliente = row.type === "cliente";
        const canEdit = !isCliente || clientsCapabilities.canEditClient;
        const canDelete = !isCliente || clientsCapabilities.canDeleteClient;
        const actions: RowAction<DirectorioRow>[] = [];
        if (isCliente && clientsCapabilities.canViewClients) {
          actions.push({ label: "Ver ficha", onSelect: (r: DirectorioRow) => setDetailContactId(r.id) });
        }
        if (canEdit) actions.push({ label: "Editar", onSelect: (r: DirectorioRow) => { void openEdit(r); } });
        if (canDelete) {
          actions.push({
            label: "Eliminar",
            variant: "destructive" as const,
            separatorBefore: true,
            onSelect: (r: DirectorioRow) => { void deleteRow(r); },
          });
        }
        return actions;
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, columnOrder, dataColumnsByKey, clientsCapabilities]
  );

  return (
    <div>
      <PageHeader
        title="Directorio"
        description="Clientes, socios y proveedores — todo en un lugar."
        actions={
          <>
            <Tabs
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as typeof typeFilter);
                setSelected(new Set());
                setFilters(emptyFilters);
              }}
            >
              <TabsList>
                {TYPE_FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {f === "Todos" ? "Todos" : CONTACT_TYPE_LABEL[f]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ExportMenu onExport={exportDirectorio} disabled={!clientsCapabilities.canExportData} />
            <Button onClick={openCreate}>+ Nuevo contacto</Button>
          </>
        }
      />

      {typeFilter === "proveedor" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Filtrar:</span>
          <Select value={filters.subtype || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, subtype: v === "__all__" ? "" : (v as ProviderSubtype) }))}>
            <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Subtipo: Todos</SelectItem>
              {PROVIDER_SUBTYPES.map((s) => <SelectItem key={s} value={s}>{PROVIDER_SUBTYPE_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "__all__" ? "" : (v as ProviderStatus) }))}>
            <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Estado: Todos</SelectItem>
              {PROVIDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROVIDER_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.minRating.toString()} onValueChange={(v) => setFilters((f) => ({ ...f, minRating: Number(v) }))}>
            <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RATING_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {activeFiltersCount > 0 ? (
            <Button variant="ghost" size="sm" className="ml-auto h-auto px-2.5 py-1 text-xs text-destructive" onClick={() => setFilters(emptyFilters)}>
              ✕ Limpiar ({activeFiltersCount})
            </Button>
          ) : null}
        </div>
      ) : null}

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

      <ContactEditorSheet
        show={showEditor}
        onClose={closeEditor}
        editingId={editingId}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={() => { void saveDraft(); }}
      />

      {activeDetailContact ? (
        <ClientDetailSheet
          contact={activeDetailContact}
          onClose={() => setDetailContactId(null)}
          onEdit={() => {
            const row = rows.find((r) => r.id === activeDetailContact.id);
            setDetailContactId(null);
            if (row) void openEdit(row);
          }}
          onDelete={() => {
            const row = rows.find((r) => r.id === activeDetailContact.id);
            if (row) void deleteRow(row);
          }}
          canEdit={clientsCapabilities.canEditClient}
          canDelete={clientsCapabilities.canDeleteClient}
        />
      ) : null}
    </div>
  );
}

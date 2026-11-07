"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ClientDetailSheet } from "@/components/directorio/ClientDetailSheet";
import {
  ContactEditorSheet,
  contactDraftFromDetail,
  draftToContactInput,
  emptyContactDraft,
  type ContactDraft,
} from "@/components/directorio/ContactEditorSheet";
import { FiltersBar } from "@/components/patterns/FiltersBar";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { PersonasTabs, type PersonasTab } from "@/components/personas/PersonasTabs";
import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { useStyle } from "@/components/shell/StyleProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import type { RowAction } from "@/components/v2/table/RowActionsMenu";
import {
  createContactAction,
  deleteContactAction,
  fetchContactAction,
  updateContactAction,
} from "@/lib/actions/contacts-actions";
import { actionErrorText } from "@/lib/errors";
import {
  PERSONAS_EMPTY_TITLE,
  contactSheetHref,
  contactsForTab,
  contratistasCards,
  personasContactsTable,
  proveedoresChips,
  type PersonasContact,
  type PersonasContactsTab,
  type ProveedoresSubfilter,
} from "@/lib/personas/contacts";
import type { ContactDetail, ProviderSubtype } from "@/lib/types/core";

export type PersonasContactsCapabilities = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** `canSeeAdminData`: the sheet lists the contact's projects. */
  isAdmin: boolean;
};

export type PersonasContactsProps = {
  tab: PersonasContactsTab;
  /** Every contact the viewer may see (already sanitized on the server). */
  contacts: PersonasContact[];
  counts: Record<PersonasTab, number>;
  /** Proveedores `?tipo=` chip; ignored on the other tabs. */
  subfilter: ProveedoresSubfilter | null;
  capabilities: PersonasContactsCapabilities;
};

const SUBFILTER_SUBTYPE: Record<ProveedoresSubfilter, ProviderSubtype> = {
  colaboradores: "colaborador",
  contratistas: "contratista",
  tiendas: "tienda",
};

const SEARCH_PLACEHOLDER: Record<PersonasContactsTab, string> = {
  clientes: "Buscar clientes",
  contratistas: "Buscar contratistas",
  proveedores: "Buscar proveedores",
};

function newDraftFor(tab: PersonasContactsTab, subfilter: ProveedoresSubfilter | null): ContactDraft {
  if (tab === "clientes") return { ...emptyContactDraft, type: "cliente" };
  const providerSubtype: ProviderSubtype =
    tab === "contratistas" ? "contratista" : subfilter ? SUBFILTER_SUBTYPE[subfilter] : emptyContactDraft.providerSubtype;
  return { ...emptyContactDraft, type: "proveedor", providerSubtype };
}

/**
 * Personas · Clientes / Contratistas / Proveedores (redesign FE §3.6): one
 * `ListPage` per tab over the Directorio contacts. `?contacto=<id>` opens the
 * existing `ClientDetailSheet`; create / edit go through the existing
 * `ContactEditorSheet`. Styles live in the widgets (no per-style markup here).
 */
export function PersonasContacts({ tab, contacts, counts, subfilter, capabilities }: PersonasContactsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSubfilter = tab === "proveedores" ? subfilter : null;
  const { style, isOverridden } = useStyle();
  const hrefOptions = { subfilter: activeSubfilter, estilo: isOverridden ? style : null };

  const [search, setSearch] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [formError, setFormError] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const detailId = searchParams.get("contacto");
  const [detail, setDetail] = useState<ContactDetail | null>(null);

  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    fetchContactAction(detailId)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(actionErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  const activeDetail = detailId && detail?.id === detailId ? detail : null;

  function closeDetail() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contacto");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const visible = useMemo(
    () => contactsForTab(contacts, tab, { subfilter: activeSubfilter, search }),
    [contacts, tab, activeSubfilter, search],
  );
  const table = useMemo(() => personasContactsTable(tab, visible), [tab, visible]);

  function openCreate() {
    setFormError("");
    setEditingId(null);
    setDraft(newDraftFor(tab, activeSubfilter));
    setShowEditor(true);
  }

  async function openEdit(id: string) {
    setFormError("");
    try {
      const row = await fetchContactAction(id);
      if (!row) {
        toast.error(actionErrorText("NOT_FOUND"));
        return;
      }
      setEditingId(id);
      setDraft(contactDraftFromDetail(row));
      setShowEditor(true);
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    try {
      const input = draftToContactInput(draft);
      if (editingId !== null) {
        const saved = await updateContactAction(editingId, input);
        if (detailId === editingId) setDetail(saved);
      } else {
        await createContactAction(input);
      }
      setShowEditor(false);
      toast.success("Contacto guardado");
      router.refresh();
    } catch (err) {
      setFormError(actionErrorText(err));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteContactAction(toDelete.id);
      if (detailId === toDelete.id) closeDetail();
      setToDelete(null);
      toast.success("Contacto eliminado");
      router.refresh();
    } catch (err) {
      toast.error(actionErrorText(err));
    } finally {
      setDeleting(false);
    }
  }

  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? "";

  const rowActions: RowAction<Record<string, unknown>>[] = [
    { label: "Ver ficha", onSelect: (row) => router.push(contactSheetHref(tab, String(row.id), hrefOptions), { scroll: false }) },
  ];
  if (capabilities.canEdit) rowActions.push({ label: "Editar", onSelect: (row) => void openEdit(String(row.id)) });
  if (capabilities.canDelete) {
    rowActions.push({
      label: "Eliminar",
      variant: "destructive",
      separatorBefore: true,
      onSelect: (row) => setToDelete({ id: String(row.id), name: nameOf(String(row.id)) }),
    });
  }

  const renderCell = (columnKey: string, row: Record<string, unknown>) =>
    columnKey === "name" ? (
      <Link href={contactSheetHref(tab, String(row.id), hrefOptions)} scroll={false} className="font-medium hover:underline">
        {String(row.name)}
      </Link>
    ) : undefined;

  const spec: ListSpec =
    tab === "contratistas"
      ? {
          kind: "cards",
          items: contratistasCards(visible, hrefOptions),
          table,
          footer: capabilities.canEdit
            ? (item) => (
                <Button variant="outline" size="sm" onClick={() => void openEdit(item.id)}>
                  Editar
                </Button>
              )
            : undefined,
        }
      : { kind: "table", data: table, renderCell, rowActions };

  const addAction = capabilities.canCreate ? { label: "Agregar", onClick: openCreate } : undefined;
  const empty: EmptyStateProps = search.trim()
    ? { title: "No hay resultados para esta búsqueda." }
    : { title: PERSONAS_EMPTY_TITLE[tab], ...(addAction ? { action: addAction } : {}) };

  return (
    <>
      <ListPage
        header={{
          title: "Personas",
          description: "Equipo interno y directorio externo en un solo lugar.",
          actions: capabilities.canCreate ? <Button onClick={openCreate}>Agregar persona</Button> : undefined,
        }}
        tabs={<PersonasTabs active={tab} counts={counts} />}
        filters={
          <FiltersBar
            chips={tab === "proveedores" ? proveedoresChips(contacts, activeSubfilter, hrefOptions.estilo) : undefined}
            search={{ value: search, placeholder: SEARCH_PLACEHOLDER[tab], onChange: setSearch }}
          />
        }
        spec={spec}
        empty={empty}
      />

      <ContactEditorSheet
        show={showEditor}
        onClose={() => {
          setShowEditor(false);
          setFormError("");
        }}
        editingId={editingId}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={() => void saveDraft()}
      />

      {activeDetail ? (
        <ClientDetailSheet
          contact={activeDetail}
          onClose={closeDetail}
          onEdit={() => {
            const id = activeDetail.id;
            closeDetail();
            void openEdit(id);
          }}
          onDelete={() => setToDelete({ id: activeDetail.id, name: activeDetail.name })}
          canEdit={capabilities.canEdit}
          canDelete={capabilities.canDelete}
          isAdmin={capabilities.isAdmin}
        />
      ) : null}

      <AlertDialog open={toDelete !== null} onOpenChange={(next) => (next ? undefined : setToDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

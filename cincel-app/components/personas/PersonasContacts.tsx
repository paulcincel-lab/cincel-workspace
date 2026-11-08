"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { createContactAction, deleteContactAction, updateContactAction } from "@/lib/actions/contacts-actions";
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
import { CONTACT_PARAM, SEARCH_PARAM, contactIdFromHref, replaceSearchParam } from "@/lib/personas/url-state";
import { qk } from "@/lib/query/keys";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import { contactDetailOptions } from "@/lib/query/options/contacts";
import {
  CATALOG_CONTACTS_PREFIX,
  PERSONAS_CONTACTS_PREFIX,
  personasContactsOptions,
  personasCountsOptions,
} from "@/lib/query/options/personas";
import type { ContactDetail, ContactInput, ProviderSubtype } from "@/lib/types/core";

export type PersonasContactsCapabilities = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** `canSeeAdminData`: the sheet lists the contact's projects. */
  isAdmin: boolean;
};

export type PersonasContactsProps = {
  tab: PersonasContactsTab;
  /** This tab's contacts (its own types only, already sanitized on the server). */
  contacts: PersonasContact[];
  /** `personas.counts()`; undefined while it loads. */
  counts: Record<PersonasTab, number> | undefined;
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

/** How long the search draft waits before it goes into `?q=`. */
export const SEARCH_DEBOUNCE_MS = 250;

function newDraftFor(tab: PersonasContactsTab, subfilter: ProveedoresSubfilter | null): ContactDraft {
  if (tab === "clientes") return { ...emptyContactDraft, type: "cliente" };
  const providerSubtype: ProviderSubtype =
    tab === "contratistas" ? "contratista" : subfilter ? SUBFILTER_SUBTYPE[subfilter] : emptyContactDraft.providerSubtype;
  return { ...emptyContactDraft, type: "proveedor", providerSubtype };
}

/** Every Proyectos `clientes` tab (`proyectos.tab(id, 'clientes')` and its activity). */
function isProyectosClientesKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "proyectos" && queryKey[2] === "clientes";
}

/**
 * `/personas/{clientes,contratistas,proveedores}` on the client (Query
 * Migration 6): the tab's `personas.contacts(tab, tipo)` and the shared
 * `personas.counts()`, both prefetched by the page and hydrated.
 */
export function PersonasContactsScreen({ tab, tipo }: { tab: PersonasContactsTab; tipo: string | null }) {
  const { data } = useQuery(personasContactsOptions(tab, tipo));
  const { data: counts } = useQuery(personasCountsOptions());
  if (!data) return null;
  return <PersonasContacts {...data} counts={counts} />;
}

/**
 * Personas · Clientes / Contratistas / Proveedores (redesign FE §3.6): one
 * `ListPage` per tab over the Directorio contacts. `?contacto=<id>` opens the
 * existing `ClientDetailSheet` and `?q=` holds the search; both change with
 * `history.replaceState` (no server render). Create / edit go through the
 * existing `ContactEditorSheet`. Styles live in the widgets (no per-style
 * markup here).
 */
export function PersonasContacts({ tab, contacts, counts, subfilter, capabilities }: PersonasContactsProps) {
  const qc = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSubfilter = tab === "proveedores" ? subfilter : null;
  const { style, isOverridden } = useStyle();
  const hrefOptions = { subfilter: activeSubfilter, estilo: isOverridden ? style : null };

  // ── Search: a local draft, debounced into `?q=` ────────────────────────────
  const urlSearch = searchParams.get(SEARCH_PARAM) ?? "";
  const [searchDraft, setSearchDraft] = useState(urlSearch);
  const [syncedSearch, setSyncedSearch] = useState(urlSearch);
  if (urlSearch !== syncedSearch) {
    // The URL changed under us (back / forward, a link): follow it.
    setSyncedSearch(urlSearch);
    if (urlSearch !== searchDraft.trim()) setSearchDraft(urlSearch);
  }
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  function onSearchChange(value: string) {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => replaceSearchParam(SEARCH_PARAM, value.trim() || null), SEARCH_DEBOUNCE_MS);
  }

  // ── Contact sheet: `?contacto=<id>` ───────────────────────────────────────
  const detailId = searchParams.get(CONTACT_PARAM);
  const { data: detail } = useQuery({ ...contactDetailOptions(detailId ?? ""), enabled: Boolean(detailId) });
  const activeDetail: ContactDetail | null = detailId && detail?.id === detailId ? detail : null;

  const openDetail = (id: string) => replaceSearchParam(CONTACT_PARAM, id);
  const closeDetail = () => replaceSearchParam(CONTACT_PARAM, null);

  /** Same-page `?contacto=` links (name cells, Contratistas cards) open the sheet without a navigation. */
  function interceptContactLinks(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
    if (!anchor || anchor.getAttribute("target") === "_blank") return;
    const id = contactIdFromHref(anchor.getAttribute("href") ?? "", pathname);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    openDetail(id);
  }

  // ── Editor and delete ─────────────────────────────────────────────────────
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [formError, setFormError] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const afterWrite = (id: string) => [
    PERSONAS_CONTACTS_PREFIX,
    qk.personas.counts(),
    qk.contacts.history(id),
    CATALOG_CONTACTS_PREFIX,
  ];

  const createContact = useActionMutation((input: ContactInput) => createContactAction(input), {
    setData: (client, saved) => client.setQueryData(qk.contacts.detail(saved.id), saved),
    invalidate: (_input, saved) => (saved ? afterWrite(saved.id) : []),
    onFormError: setFormError,
    successToast: "Contacto guardado",
  });

  const updateContact = useActionMutation(
    ({ id, input }: { id: string; input: ContactInput }) => updateContactAction(id, input),
    {
      setData: (client, saved) => client.setQueryData(qk.contacts.detail(saved.id), saved),
      invalidate: ({ id }) => afterWrite(id),
      onFormError: setFormError,
      successToast: "Contacto guardado",
    },
  );

  const deleteContact = useActionMutation((id: string) => deleteContactAction(id), {
    setData: (client, _data, id) => {
      client.removeQueries({ queryKey: qk.contacts.detail(id) });
      void client.invalidateQueries({ predicate: (query) => isProyectosClientesKey(query.queryKey) });
    },
    invalidate: [PERSONAS_CONTACTS_PREFIX, qk.personas.counts(), CATALOG_CONTACTS_PREFIX],
    successToast: "Contacto eliminado",
  });

  const visible = useMemo(
    () => contactsForTab(contacts, tab, { subfilter: activeSubfilter, search: urlSearch }),
    [contacts, tab, activeSubfilter, urlSearch],
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
      const row = await qc.fetchQuery(contactDetailOptions(id));
      if (!row) {
        toast.error(actionErrorText("NOT_FOUND"));
        return;
      }
      setEditingId(id);
      setDraft(contactDraftFromDetail(row));
      setShowEditor(true);
    } catch (err) {
      toast.error(mutationErrorText(err));
    }
  }

  function saveDraft() {
    if (!draft.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    const input = draftToContactInput(draft);
    const onSuccess = () => setShowEditor(false);
    if (editingId !== null) updateContact.mutate({ id: editingId, input }, { onSuccess });
    else createContact.mutate(input, { onSuccess });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const { id } = toDelete;
    deleteContact.mutate(id, {
      onSuccess: () => {
        if (detailId === id) closeDetail();
        setToDelete(null);
      },
    });
  }

  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? "";

  const rowActions: RowAction<Record<string, unknown>>[] = [
    { label: "Ver ficha", onSelect: (row) => openDetail(String(row.id)) },
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
  const empty: EmptyStateProps = urlSearch.trim()
    ? { title: "No hay resultados para esta búsqueda." }
    : { title: PERSONAS_EMPTY_TITLE[tab], ...(addAction ? { action: addAction } : {}) };

  return (
    <>
      <div className="contents" onClickCapture={interceptContactLinks}>
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
              search={{ value: searchDraft, placeholder: SEARCH_PLACEHOLDER[tab], onChange: onSearchChange }}
            />
          }
          spec={spec}
          empty={empty}
        />
      </div>

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
        onSave={saveDraft}
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
            <AlertDialogAction variant="destructive" disabled={deleteContact.isPending} onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

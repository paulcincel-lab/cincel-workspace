"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { getDrivePreviewUrl, inferLinkTypeFromUrl } from "@/lib/google/drive-url";
import {
  createResourceLinkAction,
  deleteResourceLinkAction,
  fetchResourceLinksAction,
  updateResourceLinkAction,
} from "@/lib/actions/resources-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canCreateResourceInSection,
  canDeleteResourceInSection,
  canEditResourceInSection,
  canViewResourceSection,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import type { DriveFileMeta, Staff } from "@/lib/types/core";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";

interface RecursosClientProps {
  initialLinks: ResourceLink[];
  driveEnabled: boolean;
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
 * of six navigations. `/recursos/empresa/*` stays a separate multi-page
 * section (its own nav group) — this page's "Empresa" tab is a read-through
 * of the same underlying data, still gated by the same capability checks.
 */
export function RecursosClient({ initialLinks, driveEnabled }: RecursosClientProps) {
  const [links, setLinks] = useState<ResourceLink[]>(initialLinks);
  const [section, setSection] = useState<"Todo" | ResourceSection>("Todo");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [previewLink, setPreviewLink] = useState<ResourceLink | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftSection, setDraftSection] = useState<ResourceSection>("mis-documentos");
  const [draftDrive, setDraftDrive] = useState<Omit<DriveFileMeta, "id"> | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const previewUrl = previewLink ? getDrivePreviewUrl(previewLink.url, previewLink.linkType) : null;

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const resourcesCapabilities = useMemo(() => resolveResourcesCapabilities(authenticatedUser), [authenticatedUser]);

  const [staff, setStaff] = useState<Staff[]>([]);
  useEffect(() => {
    void fetchStaffAction().then(setStaff);
  }, []);
  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const effectiveSelectedStaffId = useMemo(() => {
    if (selectedStaffId && activeStaff.some((s) => s.id === selectedStaffId)) return selectedStaffId;
    return activeStaff[0]?.id ?? null;
  }, [activeStaff, selectedStaffId]);

  // Re-fetch once the client has staff/session context ready, so the
  // "personal for" filter reflects the current user's own documents.
  useEffect(() => {
    void fetchResourceLinksAction().then(setLinks).catch(() => {
      // Not authorized / no session — keep whatever the server render gave us.
    });
  }, []);

  const viewableSections = useMemo(
    () => SECTIONS.filter((s) => canViewResourceSection({ capabilities: resourcesCapabilities, section: s })),
    [resourcesCapabilities]
  );

  const viewableLinks = useMemo(
    () =>
      links
        .filter((l) => viewableSections.includes(l.section))
        .filter((l) => {
          if (!l.personalFor) return true;
          return l.personalFor.id === effectiveSelectedStaffId;
        }),
    [links, viewableSections, effectiveSelectedStaffId]
  );

  const visible = useMemo(
    () => (section === "Todo" ? viewableLinks : viewableLinks.filter((l) => l.section === section)),
    [viewableLinks, section]
  );

  const createSection = draftSection;
  const canCreateInSection = canCreateResourceInSection({ capabilities: resourcesCapabilities, section: createSection });
  const canEditInSection = editingLink
    ? canEditResourceInSection({ capabilities: resourcesCapabilities, section: editingLink.section, viewerId: authenticatedUser?.member.id ?? null, ownerId: editingLink.owner?.id ?? null, personalForId: editingLink.personalFor?.id ?? null })
    : false;

  const openEdit = useCallback(
    (link: ResourceLink) => {
      if (!canEditResourceInSection({ capabilities: resourcesCapabilities, section: link.section, viewerId: authenticatedUser?.member.id ?? null, ownerId: link.owner?.id ?? null, personalForId: link.personalFor?.id ?? null })) return;
      setEditingLink(link);
      setDraftTitle(link.title);
      setDraftUrl(link.url);
      setDraftSection(link.section);
      setDraftDrive(null);
      setCreateError(null);
      setCreateOpen(true);
    },
    [resourcesCapabilities, authenticatedUser]
  );

  const applyDrivePick = (entry: DrivePickerEntry) => {
    setShowDrivePicker(false);
    setDraftUrl(entry.webViewLink);
    setDraftTitle((current) => current.trim() || entry.name);
    setDraftDrive({
      googleFileId: entry.id,
      fileName: entry.name,
      mimeType: entry.mimeType,
      iconLink: entry.iconLink,
      thumbnailLink: entry.thumbnailLink,
      webViewLink: entry.webViewLink,
      syncedAt: new Date().toISOString(),
    });
  };

  function closeResourceSheet() {
    setCreateOpen(false);
    setEditingLink(null);
    setDraftTitle("");
    setDraftUrl("");
    setDraftDrive(null);
  }

  async function saveResource() {
    const title = draftTitle.trim();
    const url = draftUrl.trim();
    if (!title || !url) return;

    setCreateError(null);

    if (editingLink) {
      if (!canEditInSection) return;
      try {
        const updated = await updateResourceLinkAction(editingLink.id, {
          title,
          url,
          section: draftSection,
          linkType: inferLinkTypeFromUrl(url, "web"),
          drive: draftDrive ?? undefined,
        });
        setLinks((cur) => cur.map((l) => (l.id === updated.id ? updated : l)));
        closeResourceSheet();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "No se pudo editar el recurso.");
      }
      return;
    }

    if (!canCreateInSection) return;
    const isPersonal = draftSection === "mis-documentos" ? effectiveSelectedStaffId : null;
    try {
      const created = await createResourceLinkAction({
        title,
        url,
        section: draftSection,
        linkType: inferLinkTypeFromUrl(url, "web"),
        ownerId: isPersonal,
        personalForId: isPersonal,
        drive: draftDrive,
      });
      setLinks((cur) => [...cur, created]);
      closeResourceSheet();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear el recurso.");
    }
  }

  const removeResource = useCallback(
    async (link: ResourceLink) => {
      if (!canDeleteResourceInSection({ capabilities: resourcesCapabilities, section: link.section })) return;
      if (!window.confirm(`¿Quitar "${link.title}"?`)) return;
      try {
        await deleteResourceLinkAction(link.id);
        setLinks((cur) => cur.filter((l) => l.id !== link.id));
        setPreviewLink((cur) => (cur?.id === link.id ? null : cur));
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "No se pudo quitar el recurso.");
      }
    },
    [resourcesCapabilities]
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
    const text = links
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
      createRowActionsColumn<ResourceLink>((link) => {
        const actions: RowAction<ResourceLink>[] = [
          { label: "Vista previa", onSelect: setPreviewLink },
          { label: "Abrir en Drive", onSelect: (l) => window.open(l.url, "_blank", "noopener") },
        ];
        if (canEditResourceInSection({ capabilities: resourcesCapabilities, section: link.section, viewerId: authenticatedUser?.member.id ?? null, ownerId: link.owner?.id ?? null, personalForId: link.personalFor?.id ?? null })) {
          actions.push({ label: "Editar", separatorBefore: true, onSelect: openEdit });
        }
        if (canDeleteResourceInSection({ capabilities: resourcesCapabilities, section: link.section })) {
          actions.push({ label: "Quitar", separatorBefore: true, variant: "destructive", onSelect: removeResource });
        }
        return actions;
      }),
    ],
    [selected, resourcesCapabilities, removeResource, openEdit, authenticatedUser]
  );

  if (!resourcesCapabilities.canViewResources) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold">Sin acceso a Recursos</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tu acceso actual no permite visualizar esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Recursos"
        description="Acceso rápido a las áreas de recursos del despacho."
        actions={
          <>
            <Select
              value={effectiveSelectedStaffId ?? ""}
              onValueChange={(v) => setSelectedStaffId(v as string)}
            >
              <SelectTrigger className="w-48"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                {activeStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs
              value={section}
              onValueChange={(v) => {
                setSection(v as typeof section);
                setSelected(new Set());
              }}
            >
              <TabsList>
                <TabsTrigger value="Todo">Todo</TabsTrigger>
                {viewableSections.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {SECTION_LABEL[s]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              onClick={() => { setEditingLink(null); setDraftTitle(""); setDraftUrl(""); setDraftDrive(null); setCreateOpen(true); }}
              disabled={!canCreateResourceInSection({ capabilities: resourcesCapabilities, section: "mis-documentos" }) && !resourcesCapabilities.canManageFavoritesSection && !resourcesCapabilities.enterprise.canCreate}
            >
              + Agregar recurso
            </Button>
          </>
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
        onRowClick={setPreviewLink}
        searchPlaceholder="Buscar carpeta o recurso…"
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage="No hay recursos en esta vista."
      />

      <Sheet open={previewLink !== null} onOpenChange={(next) => { if (!next) setPreviewLink(null); }}>
        <SheetContent className="w-[90vw] max-w-5xl p-0" side="right">
          <SheetHeader className="flex-row items-center justify-between gap-3 border-b border-border p-4">
            <SheetTitle className="truncate">{previewLink?.title}</SheetTitle>
            {previewLink ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewLink.url, "_blank", "noopener")}
              >
                Abrir en Drive
              </Button>
            ) : null}
          </SheetHeader>
          {previewUrl ? (
            <iframe title={previewLink?.title} src={previewUrl} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No hay vista previa disponible para este recurso — usa &ldquo;Abrir en Drive&rdquo;.
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={(next) => { if (!next) closeResourceSheet(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingLink ? "Editar recurso" : "Agregar recurso"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div>
              <Label className="mb-2 block">Nombre</Label>
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Bitácora de obra" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Enlace (Drive, Docs, o web)</Label>
                {driveEnabled ? (
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setShowDrivePicker(true)}>
                    Elegir de Google Drive
                  </Button>
                ) : null}
              </div>
              <Input
                value={draftUrl}
                onChange={(e) => { setDraftUrl(e.target.value); setDraftDrive(null); }}
                placeholder="https://drive.google.com/…"
              />
              {draftDrive ? (
                <p className="mt-1 text-xs text-muted-foreground">Vinculado a Drive: {draftDrive.fileName}</p>
              ) : null}
            </div>
            <div>
              <Label className="mb-2 block">Sección</Label>
              <Select value={draftSection} onValueChange={(v) => setDraftSection(v as ResourceSection)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SECTION_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={closeResourceSheet}>
              Cancelar
            </Button>
            <Button
              onClick={saveResource}
              disabled={!draftTitle.trim() || !draftUrl.trim() || !(editingLink ? canEditInSection : canCreateInSection)}
            >
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DrivePickerDialog open={showDrivePicker} onClose={() => setShowDrivePicker(false)} onPick={applyDrivePick} />
    </div>
  );
}

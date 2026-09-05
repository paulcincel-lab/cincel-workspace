"use client";

import { useCallback, useMemo, useState } from "react";
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
import { deleteResourceLink, saveResourceLinks } from "@/lib/repositories/resources-repository";
import { getTeamMembersSnapshot } from "@/lib/repositories/team-repository";
import { teamMembersPublic, type TeamMemberPublic as TeamMember } from "@/lib/data/team-public";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canCreateResourceInSection,
  canDeleteResourceInSection,
  canViewResourceSection,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import type { DriveFileMeta, ResourceLink, ResourceSection } from "@/lib/types/resource";

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

function loadTeamMembers(): TeamMember[] {
  const snapshot = getTeamMembersSnapshot();
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot;
  }
  return teamMembersPublic;
}

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
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftSection, setDraftSection] = useState<ResourceSection>("mis-documentos");
  const [draftDrive, setDraftDrive] = useState<DriveFileMeta | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const previewUrl = previewLink ? getDrivePreviewUrl(previewLink.url, previewLink.linkType) : null;

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const resourcesCapabilities = useMemo(() => resolveResourcesCapabilities(authenticatedUser), [authenticatedUser]);

  const [members] = useState<TeamMember[]>(() => loadTeamMembers());
  const activeMembers = useMemo(() => members.filter((m) => m.active), [members]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const effectiveSelectedMemberId = useMemo(() => {
    if (selectedMemberId && activeMembers.some((m) => m.id === selectedMemberId)) return selectedMemberId;
    return activeMembers[0]?.id ?? null;
  }, [activeMembers, selectedMemberId]);

  const viewableSections = useMemo(
    () => SECTIONS.filter((s) => canViewResourceSection({ capabilities: resourcesCapabilities, section: s })),
    [resourcesCapabilities]
  );

  const viewableLinks = useMemo(
    () =>
      links
        .filter((l) => viewableSections.includes(l.section))
        .filter((l) => {
          if (l.templateKey.startsWith("personal_mis_documentos")) {
            return l.personalForTeamMemberId === effectiveSelectedMemberId;
          }
          return true;
        }),
    [links, viewableSections, effectiveSelectedMemberId]
  );

  const visible = useMemo(
    () => (section === "Todo" ? viewableLinks : viewableLinks.filter((l) => l.section === section)),
    [viewableLinks, section]
  );

  const createSection = draftSection;
  const canCreateInSection = canCreateResourceInSection({ capabilities: resourcesCapabilities, section: createSection });

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

  async function createResource() {
    const title = draftTitle.trim();
    const url = draftUrl.trim();
    if (!title || !url) return;
    if (!canCreateInSection) return;
    const now = new Date().toISOString();
    const newLink: ResourceLink = {
      id: crypto.randomUUID(),
      templateKey: "custom",
      title,
      section: draftSection,
      subsection: null,
      linkType: inferLinkTypeFromUrl(url, "web"),
      appliesTo: "general",
      url,
      status: "vigente",
      ownerTeamMemberId: null,
      personalForTeamMemberId: null,
      updatedAt: now,
      history: [{ id: crypto.randomUUID(), at: now, action: "created", note: "Recurso creado" }],
      drive: draftDrive,
    };
    const next = [...links, newLink];
    setLinks(next);
    setCreateOpen(false);
    setDraftTitle("");
    setDraftUrl("");
    setDraftDrive(null);
    await saveResourceLinks(next);
  }

  const removeResource = useCallback(
    async (link: ResourceLink) => {
      if (!canDeleteResourceInSection({ capabilities: resourcesCapabilities, section: link.section })) return;
      if (!window.confirm(`¿Quitar "${link.title}"?`)) return;
      setLinks((cur) => cur.filter((l) => l.id !== link.id));
      setPreviewLink((cur) => (cur?.id === link.id ? null : cur));
      await deleteResourceLink(link.id);
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
        if (canDeleteResourceInSection({ capabilities: resourcesCapabilities, section: link.section })) {
          actions.push({ label: "Quitar", separatorBefore: true, variant: "destructive", onSelect: removeResource });
        }
        return actions;
      }),
    ],
    [selected, resourcesCapabilities, removeResource]
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
              value={String(effectiveSelectedMemberId ?? "")}
              onValueChange={(v) => setSelectedMemberId(Number(v))}
            >
              <SelectTrigger className="w-48"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                {activeMembers.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
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
              onClick={() => setCreateOpen(true)}
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

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Agregar recurso</SheetTitle>
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
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createResource} disabled={!draftTitle.trim() || !draftUrl.trim() || !canCreateInSection}>
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DrivePickerDialog open={showDrivePicker} onClose={() => setShowDrivePicker(false)} onPick={applyDrivePick} />
    </div>
  );
}

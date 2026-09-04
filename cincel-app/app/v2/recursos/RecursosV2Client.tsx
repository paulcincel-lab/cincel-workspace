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
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { getDrivePreviewUrl, inferLinkTypeFromUrl } from "@/lib/google/drive-url";
import { saveResourceLinks } from "@/lib/repositories/resources-repository";
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
  const [links, setLinks] = useState<ResourceLink[]>(initialLinks);
  const [section, setSection] = useState<"Todo" | ResourceSection>("Todo");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [previewLink, setPreviewLink] = useState<ResourceLink | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftSection, setDraftSection] = useState<ResourceSection>("mis-documentos");
  const previewUrl = previewLink ? getDrivePreviewUrl(previewLink.url, previewLink.linkType) : null;

  const visible = useMemo(
    () => (section === "Todo" ? links : links.filter((l) => l.section === section)),
    [links, section]
  );

  async function createResource() {
    const title = draftTitle.trim();
    const url = draftUrl.trim();
    if (!title || !url) return;
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
      drive: null,
    };
    const next = [...links, newLink];
    setLinks(next);
    setCreateOpen(false);
    setDraftTitle("");
    setDraftUrl("");
    await saveResourceLinks(next);
  }

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
      createRowActionsColumn<ResourceLink>(() => [
        { label: "Vista previa", onSelect: setPreviewLink },
        { label: "Abrir en Drive", onSelect: (l) => window.open(l.url, "_blank", "noopener") },
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
          <>
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
            <Button onClick={() => setCreateOpen(true)}>+ Agregar recurso</Button>
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
              <Label className="mb-2 block">Enlace (Drive, Docs, o web)</Label>
              <Input value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} placeholder="https://drive.google.com/…" />
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
            <Button onClick={createResource} disabled={!draftTitle.trim() || !draftUrl.trim()}>
              Guardar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

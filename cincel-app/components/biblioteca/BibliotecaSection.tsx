"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";

import { FiltersBar } from "@/components/patterns/FiltersBar";
import { ListPage } from "@/components/patterns/ListPage";
import type { DriveBrowserEntry } from "@/components/recursos/DriveBrowser";
import { DriveFilePreviewSheet, ResourcePreview } from "@/components/recursos/ResourcePreview";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import { createResourceLinkAction, deleteResourceLinkAction, recordResourceOpenAction } from "@/lib/actions/resources-actions";
import {
  TIPO_LABEL,
  TRAMO_FILTER_LABEL,
  favoriteFor,
  filterSectionLinks,
  recurso,
  resourceDownload,
  sectionTable,
  type BibliotecaSectionSlug,
  type TipoFilter,
  type TramoFilter,
} from "@/lib/biblioteca/catalog";
import type { BibliotecaData } from "@/lib/biblioteca/load";
import { useDriveStatus } from "@/lib/google/use-drive-status";
import { useActionMutation } from "@/lib/query/mutation";
import { BIBLIOTECA_LINKS_PREFIX, bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { useRecentDocs } from "@/lib/stores/recent-docs-store";
import type { ResourceLink, ResourceLinkInput, ResourceSection } from "@/lib/types/resource";
import type { ActionResult } from "@/lib/types/schedule";

export type BibliotecaSectionProps = {
  section: BibliotecaSectionSlug;
  /** Active filters from the URL (`?tipo=`, `?tramo=`). */
  tipo?: TipoFilter | null;
  tramo?: TramoFilter | null;
};

const NO_LINKS: ResourceLink[] = [];

/** Id of the favorite shown while its create call runs. */
export function optimisticFavoriteId(link: ResourceLink): string {
  return `optimistic:${link.id}`;
}

/** The viewer's "Mis favoritos" link pointing at `link` (the create input). */
export function favoriteInput(link: ResourceLink, viewerId: string): ResourceLinkInput {
  return {
    title: link.title,
    section: "mis-favoritos",
    linkType: link.linkType,
    appliesTo: link.appliesTo,
    url: link.url,
    ownerId: viewerId,
    personalForId: viewerId,
    drive: link.drive
      ? {
          googleFileId: link.drive.googleFileId,
          fileName: link.drive.fileName,
          mimeType: link.drive.mimeType,
          iconLink: link.drive.iconLink,
          thumbnailLink: link.drive.thumbnailLink,
          webViewLink: link.drive.webViewLink,
          syncedAt: link.drive.syncedAt,
        }
      : null,
  };
}

function optimisticFavorite(link: ResourceLink, viewerId: string): ResourceLink {
  const viewer = { id: viewerId, name: "" };
  return {
    ...link,
    id: optimisticFavoriteId(link),
    templateKey: null,
    section: "mis-favoritos",
    subsection: null,
    owner: viewer,
    personalFor: viewer,
    sortOrder: 0,
  };
}

type ToggleFavorite = { link: ResourceLink; current: ResourceLink | null; viewerId: string };
type ToggleSnapshot = { previous: BibliotecaData | undefined };

function patchLinks(client: QueryClient, section: BibliotecaSectionSlug, update: (links: ResourceLink[]) => ResourceLink[]): void {
  client.setQueryData<BibliotecaData>(bibliotecaLinksOptions(section).queryKey, (old) =>
    old ? { ...old, links: update(old.links) } : old,
  );
}

function filterHref(section: ResourceSection, next: { tipo: TipoFilter | null; tramo: TramoFilter | null }): string {
  const params = new URLSearchParams();
  if (next.tipo) params.set("tipo", next.tipo);
  if (next.tramo) params.set("tramo", next.tramo);
  const qs = params.toString();
  return `/biblioteca/${section}${qs ? `?${qs}` : ""}`;
}

/**
 * `/biblioteca/[seccion]` (redesign FE §3.7, frames `BibliotecaSeccion` +
 * variants): evolves the Recursos workspace section view onto `ListPage` +
 * `RecordTable`. Breadcrumb, filters (tipo, tramo, search), and per row the
 * favorite toggle (a "Mis favoritos" link of the viewer, created or removed
 * with the resource actions, optimistic on `biblioteca.links(section)`), open
 * (the workspace viewer in a sheet) and download (Drive files through the
 * app, as in the workspace). No views or downloads columns (RD-7). The rows
 * come from `biblioteca.links(section)` (this section plus the viewer's
 * favorites, prefetched by the page); Drive from `useDriveStatus()`.
 */
export function BibliotecaSection({ section, tipo = null, tramo = null }: BibliotecaSectionProps) {
  const { data } = useQuery(bibliotecaLinksOptions(section));
  const items = data?.links ?? NO_LINKS;
  const viewerId = data?.viewerId ?? null;
  const canManageFavorites = data?.capabilities.canManageFavoritesSection ?? false;
  const { configured: driveEnabled } = useDriveStatus();
  const remember = useRecentDocs((state) => state.remember);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<ResourceLink | null>(null);
  const [drivePreview, setDrivePreview] = useState<DriveBrowserEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useActionMutation<ToggleFavorite, ResourceLink | void, ToggleSnapshot>(
    async ({ link, current, viewerId: owner }): Promise<ActionResult<ResourceLink | void>> =>
      current ? deleteResourceLinkAction(current.id) : createResourceLinkAction(favoriteInput(link, owner)),
    {
      optimistic: {
        onMutate: async (client, { link, current, viewerId: owner }) => {
          const queryKey = bibliotecaLinksOptions(section).queryKey;
          await client.cancelQueries({ queryKey });
          const previous = client.getQueryData<BibliotecaData>(queryKey);
          patchLinks(client, section, (list) =>
            current ? list.filter((item) => item.id !== current.id) : [...list, optimisticFavorite(link, owner)],
          );
          return { previous };
        },
        rollback: (client, { previous }) => {
          if (previous) client.setQueryData(bibliotecaLinksOptions(section).queryKey, previous);
        },
      },
      setData: (client, created, { link }) => {
        if (created) {
          const tempId = optimisticFavoriteId(link);
          patchLinks(client, section, (list) => list.map((item) => (item.id === tempId ? created : item)));
        }
        // Every other Biblioteca screen refetches on its next visit; this one is already exact.
        void client.invalidateQueries({ queryKey: BIBLIOTECA_LINKS_PREFIX, refetchType: "none" });
      },
      onFormError: setError,
    },
  );

  const meta = recurso(section);
  const label = meta?.title ?? section;
  const canFavorite = canManageFavorites && viewerId !== null;

  const rows = useMemo(() => filterSectionLinks(items, section, { tipo, tramo, query }), [items, section, tipo, tramo, query]);
  const byId = useMemo(() => new Map(rows.map((link) => [link.id, link])), [rows]);
  const favoriteIds = useMemo(
    () => new Set(rows.filter((link) => favoriteFor(link, items) !== null).map((link) => link.id)),
    [rows, items],
  );
  const table = useMemo(() => sectionTable(rows, favoriteIds), [rows, favoriteIds]);

  const openLink = (link: ResourceLink) => {
    remember(link);
    // Optimistic favorites are not rows yet; the original link is counted when opened.
    if (!link.id.startsWith("optimistic:")) void recordResourceOpenAction({ linkId: link.id }).catch(() => undefined);
    setPreview(link);
  };

  const toggleFavorite = (link: ResourceLink) => {
    if (!canFavorite || viewerId === null || toggle.isPending) return;
    setError(null);
    toggle.mutate({ link, current: favoriteFor(link, items), viewerId });
  };

  const renderCell = (columnKey: string, row: Record<string, unknown>) => {
    const link = byId.get(String(row.id));
    if (!link) return undefined;
    if (columnKey === "favorito") {
      const isFavorite = favoriteIds.has(link.id);
      if (!canFavorite) {
        return isFavorite ? (
          <span role="img" aria-label="Favorito" className="inline-flex">
            <Star aria-hidden="true" fill="currentColor" />
          </span>
        ) : (
          <span className="sr-only">No es favorito</span>
        );
      }
      return (
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Quitar ${link.title} de favoritos` : `Marcar ${link.title} como favorito`}
          disabled={toggle.isPending}
          onClick={() => toggleFavorite(link)}
        >
          <Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
        </Button>
      );
    }
    if (columnKey === "nombre") {
      return (
        <Button variant="link" className="h-auto p-0" onClick={() => openLink(link)}>
          {link.title}
        </Button>
      );
    }
    if (columnKey === "acciones") {
      const download = resourceDownload(link, driveEnabled);
      return (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openLink(link)} aria-label={`Abrir ${link.title}`}>
            Abrir
          </Button>
          {download ? (
            <a href={download.href} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`${download.label}: ${link.title}`}>
              {download.label}
            </a>
          ) : null}
        </div>
      );
    }
    return undefined;
  };

  const tipoChips = [
    { key: "tipo-todos", label: "Todos", pressed: tipo === null, href: filterHref(section, { tipo: null, tramo }) },
    ...(Object.keys(TIPO_LABEL) as TipoFilter[]).map((key) => ({
      key: `tipo-${key}`,
      label: TIPO_LABEL[key],
      pressed: tipo === key,
      href: filterHref(section, { tipo: key, tramo }),
    })),
  ];
  const tramoChips = [
    { key: "tramo-todos", label: "Todos los tramos", pressed: tramo === null, href: filterHref(section, { tipo, tramo: null }) },
    ...(Object.keys(TRAMO_FILTER_LABEL) as TramoFilter[]).map((key) => ({
      key: `tramo-${key}`,
      label: TRAMO_FILTER_LABEL[key],
      pressed: tramo === key,
      href: filterHref(section, { tipo, tramo: key }),
    })),
  ];

  const previewDownload = preview ? resourceDownload(preview, driveEnabled) : null;
  const filtered = tipo !== null || tramo !== null || query.trim().length > 0;

  return (
    <>
      <ListPage
        header={{
          title: label,
          description: meta?.description,
          breadcrumb: [{ label: "Biblioteca", href: "/biblioteca" }, { label: "Recursos", href: "/biblioteca" }, { label }],
        }}
        filters={
          <div className="flex flex-col gap-2">
            <FiltersBar chips={tipoChips} search={{ value: query, placeholder: "Buscar documento", onChange: setQuery }} />
            <FiltersBar chips={tramoChips} />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        }
        spec={{ kind: "table", data: table, renderCell }}
        empty={
          filtered
            ? { title: "Sin resultados", description: "Ningún documento coincide con los filtros." }
            : { title: `Aún no hay documentos en ${label}`, description: "Cuando se agregue un documento a esta sección aparecerá aquí." }
        }
      />

      <Sheet open={preview !== null} onOpenChange={(next) => { if (!next) setPreview(null); }}>
        <SheetContent className="w-[90vw] max-w-5xl gap-0 p-0" side="right">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <SheetTitle className="truncate">{preview?.title}</SheetTitle>
              <SheetDescription>{label}</SheetDescription>
            </div>
            {preview ? (
              <div className="flex gap-2">
                {previewDownload ? (
                  <a href={previewDownload.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {previewDownload.label}
                  </a>
                ) : null}
                <a href={preview.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {preview.linkType === "web" ? "Abrir enlace" : "Abrir en Drive"}
                </a>
              </div>
            ) : null}
          </div>
          <ResourcePreview
            link={preview}
            title={label}
            unavailableReason={
              preview?.linkType === "web"
                ? "El enlace seleccionado es tipo web y no admite vista previa embebida."
                : "No se pudo generar vista previa. Verifica que sea un enlace válido y compartido de Google Drive o Google Docs."
            }
            onDriveFileClick={setDrivePreview}
            heightClass="h-[calc(100vh-5rem)]"
          />
        </SheetContent>
      </Sheet>

      <DriveFilePreviewSheet entry={drivePreview} onClose={() => setDrivePreview(null)} />
    </>
  );
}

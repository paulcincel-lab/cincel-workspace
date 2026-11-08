"use client";

import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";

import { ListPage } from "@/components/patterns/ListPage";
import {
  driveFolderUrl,
  FolderBreadcrumbs,
  isPlainLeftClick,
  openArchivosFolder,
  ProjectFilesBrowser,
} from "@/components/proyectos/ProjectFilesBrowser";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import {
  archivosFolderFromHref,
  fileTypeLabel,
  folderContext,
  formatFileDate,
  formatFileSize,
  toFileCards,
  toFileTable,
  toStorageByType,
  type OkFilesResult,
  type ProjectFileSource,
} from "@/lib/projects/project-files-view";
import type { EntityCard } from "@/lib/types/widgets";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

export const EMPTY_PROJECT_FILES = "Este proyecto aún no tiene archivos";
export const EMPTY_FOLDER = "Esta carpeta está vacía.";

export type ProjectFilesProps = {
  projectId: string;
  result: StaffFilesResult;
  /** `canEditProjectGeneral`: may run Reintentar carpeta. */
  canRetry: boolean;
};

/**
 * Archivos tab in the redesigned project shell (redesign FE §3.5). Keeps the
 * `ProjectFilesBrowser` behavior: folder states (creating, failed, connect
 * Drive, no access) render through it unchanged; a readable folder renders as
 * a `ListPage` cards spec (Visual cards, Esencial list, Analítico table) plus
 * storage by type, from the same listing. Folder links open on the client
 * (`?folder=` via `history.pushState`, no server render; 5d, #962).
 */
export function ProjectFiles({ projectId, result, canRetry }: ProjectFilesProps) {
  if (result.status !== "ok") {
    return (
      <ListShell>
        <ProjectFilesBrowser projectId={projectId} result={result} canRetry={canRetry} />
      </ListShell>
    );
  }
  return <FolderView projectId={projectId} result={result} />;
}

function ListShell({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="archivos-title" className="flex flex-col gap-4">
      <h2 id="archivos-title" className="text-base font-semibold">
        Archivos
      </h2>
      {children}
    </section>
  );
}

function FolderView({ projectId, result }: { projectId: string; result: OkFilesResult }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { root, current, atRoot } = folderContext(result);

  const cards = useMemo(() => toFileCards(projectId, result), [projectId, result]);
  const table = useMemo(() => toFileTable(result), [result]);
  const storage = useMemo(() => toStorageByType(result), [result]);
  const items = result.items as ProjectFileSource[];
  const selected = selectedId ? (items.find((i) => i.id === selectedId && i.kind === "file") ?? null) : null;
  const uploadHref = driveFolderUrl(current.id);

  // Folder cards and table rows are real links (the widgets render them); a
  // plain click on one opens the folder here instead of a server render.
  function onFolderLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (!isPlainLeftClick(event)) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.getAttribute("target") === "_blank") return;
    const folderId = archivosFolderFromHref(projectId, link.getAttribute("href"));
    if (folderId === undefined) return;
    event.preventDefault();
    openArchivosFolder(projectId, folderId);
  }

  const actions = (
    <>
      <a href={uploadHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
        Subir archivos
      </a>
      <a
        href={driveFolderUrl(root.id)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink aria-hidden />
        Abrir en Drive
      </a>
    </>
  );

  function cardFooter(card: EntityCard) {
    const item = items.find((i) => i.id === card.id);
    if (!item || item.kind !== "file") return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={selectedId === item.id}
        onClick={() => setSelectedId((id) => (id === item.id ? null : item.id))}
      >
        Detalles
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4" onClickCapture={onFolderLinkClick}>
        <ListPage
          header={{ title: "Archivos", description: atRoot ? undefined : current.name, actions }}
          filters={<FolderBreadcrumbs projectId={projectId} breadcrumbs={result.breadcrumbs} rootId={root.id} />}
          spec={{ kind: "cards", items: cards, table, footer: cardFooter }}
          empty={{
            title: atRoot ? EMPTY_PROJECT_FILES : EMPTY_FOLDER,
            description: atRoot ? "Sube planos, renders o fotos a la carpeta del proyecto en Drive." : undefined,
            action: { label: "Subir archivos", href: uploadHref },
          }}
        />
        {storage.length > 0 ? (
          <DistributionWidget
            title="Almacenamiento por tipo"
            segments={storage}
            totalLabel="Archivos"
            extraColumns={[{ key: "tamano", label: "Tamaño" }]}
          />
        ) : null}
      </div>
      {selected ? (
        <FileDetailPanel
          item={selected}
          folderName={current.name}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function FileDetailPanel({
  item,
  folderName,
  onClose,
}: {
  item: ProjectFileSource;
  folderName: string;
  onClose(): void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Tipo", value: fileTypeLabel(item) },
    { label: "Tamaño", value: formatFileSize(item.sizeBytes) },
    ...(item.author ? [{ label: "Autor", value: item.author }] : []),
    ...(item.version ? [{ label: "Versión", value: `v${item.version}` }] : []),
    { label: "Modificado", value: formatFileDate(item.modifiedAt) },
    { label: "Carpeta", value: folderName },
  ];
  return (
    <Card className="w-full lg:sticky lg:top-4 lg:w-80" role="region" aria-label={`Detalles de ${item.name}`}>
      <CardHeader>
        <CardTitle className="break-words">{item.name}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="Cerrar detalles" onClick={onClose}>
            <X aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      {item.webViewLink ? (
        <CardFooter>
          <a href={item.webViewLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
            <ExternalLink aria-hidden />
            Abrir
          </a>
        </CardFooter>
      ) : null}
    </Card>
  );
}

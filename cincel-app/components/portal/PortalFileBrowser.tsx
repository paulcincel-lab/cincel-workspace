"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Eye, FileIcon, FileImage, FileText, Folder, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/shadcn/breadcrumb";
import { Button } from "@/components/ui/shadcn/button";
import { isPortalSignedOut, PORTAL_SIGN_IN_FALLBACK, portalFilesOptions } from "@/lib/query/options/portal";
import type { PortalFileDTO } from "@/lib/types/portal";

export { portalFilesUrl } from "@/lib/query/options/portal";

export const PORTAL_FILES_PENDING = "Los archivos estarán disponibles pronto.";
export const PORTAL_FILES_EMPTY = "Esta carpeta está vacía.";
export const PORTAL_FILES_NOT_FOUND = "No encontramos esta carpeta.";
export const PORTAL_FILES_ERROR = "No pudimos cargar los archivos. Intenta de nuevo.";
export const PORTAL_EXPORT_TOO_LARGE = "Este documento es muy grande; pide el PDF a tu equipo.";
export const PORTAL_DOWNLOAD_ERROR = "No pudimos descargar el archivo. Intenta de nuevo.";

/** Mime types the preview route serves inline (FE §3.3, BE §B.4.5); SVG is never previewed. */
const PREVIEWABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

/** **Ver** only for PDF and the raster images; Google-native files preview as their PDF export. */
export function canPreview(file: PortalFileDTO): boolean {
  return file.kind === "file" && (file.deliveredAs === "pdf" || PREVIEWABLE.has(file.mimeType));
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const MODIFIED_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

export function formatModified(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : MODIFIED_FORMAT.format(date);
}

export function portalFileUrl(projectId: string, fileId: string, kind: "download" | "preview"): string {
  return `/api/portal/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/${kind}`;
}

type Props = {
  projectId: string;
  /** The open folder (`?folder=`); null is the project's client folder. */
  folderId: string | null;
  /** Opens a folder (the page keeps it in the URL). */
  onOpenFolder: (folderId: string) => void;
};

/** Every portal call answers 401 `{ redirect }` without a session (FE §7.2); follow it. */
async function followPortalRedirect(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const body = (await res.json().catch(() => null)) as { redirect?: unknown } | null;
  const target = typeof body?.redirect === "string" && body.redirect.startsWith("/") ? body.redirect : PORTAL_SIGN_IN_FALLBACK;
  window.location.assign(target);
  return true;
}

function fileIcon(file: PortalFileDTO) {
  if (file.kind === "folder") return Folder;
  if (file.deliveredAs === "pdf" || file.mimeType === "application/pdf") return FileText;
  if (file.mimeType.startsWith("image/")) return FileImage;
  return FileIcon;
}

/**
 * Archivos tab (FE §3.3): breadcrumbs plus the contents of the project's client folder, from
 * `portal.files(id, folder)`. Folders navigate in place; a folder change cancels the previous request (FE §8)
 * and keeps the last breadcrumbs while the next folder loads, so the client can switch again mid-request.
 */
export default function PortalFileBrowser({ projectId, folderId, onOpenFolder }: Props) {
  const query = useQuery({ ...portalFilesOptions(projectId, folderId), placeholderData: keepPreviousData });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<{ fileId: string; message: string } | null>(null);

  const signedOut = isPortalSignedOut(query.error) ? query.error.redirect : null;
  useEffect(() => {
    if (signedOut) window.location.assign(signedOut);
  }, [signedOut]);

  const openFolder = useCallback(
    (id: string) => {
      setFileError(null);
      onOpenFolder(id);
    },
    [onOpenFolder]
  );

  /**
   * Google-native files are exported to PDF on download and can answer 422 `export_too_large`, so they are
   * fetched first to show the message inline; other files download through a plain link (streamed, not buffered).
   */
  const downloadExport = useCallback(
    async (file: PortalFileDTO) => {
      setDownloadingId(file.id);
      setFileError(null);
      try {
        const res = await fetch(portalFileUrl(projectId, file.id, "download"));
        if (await followPortalRedirect(res)) return;
        if (res.status === 422) {
          setFileError({ fileId: file.id, message: PORTAL_EXPORT_TOO_LARGE });
          return;
        }
        if (!res.ok) {
          setFileError({ fileId: file.id, message: PORTAL_DOWNLOAD_ERROR });
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setFileError({ fileId: file.id, message: PORTAL_DOWNLOAD_ERROR });
      } finally {
        setDownloadingId(null);
      }
    },
    [projectId]
  );

  const data = query.data;
  const loading = query.isPending || query.isPlaceholderData || signedOut !== null;
  if (!loading && data?.status === "pending") {
    return <p className="py-6 text-sm text-muted-foreground">{PORTAL_FILES_PENDING}</p>;
  }
  /** Last loaded breadcrumbs (the placeholder's while the next folder loads). */
  const breadcrumbs = data?.status === "ok" ? data.folder.breadcrumbs : [];

  return (
    <section aria-label="Archivos" className="flex min-w-0 flex-col gap-4">
      {breadcrumbs.length > 0 ? (
        <Breadcrumb aria-label="Carpetas">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => {
              const current = crumb.id === (folderId ?? breadcrumbs[0].id);
              const label = i === 0 ? "Archivos" : crumb.name;
              return (
                <Fragment key={crumb.id}>
                  {i > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {current ? (
                      <BreadcrumbPage className="break-words">{label}</BreadcrumbPage>
                    ) : (
                      <Button variant="link" size="sm" className="min-h-11 px-0" onClick={() => openFolder(crumb.id)}>
                        {label}
                      </Button>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      {loading ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Cargando archivos…
        </p>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {PORTAL_FILES_ERROR}
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : data?.status !== "ok" ? (
        <Alert>
          <AlertDescription>{PORTAL_FILES_NOT_FOUND}</AlertDescription>
        </Alert>
      ) : data.folder.items.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{PORTAL_FILES_EMPTY}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {data.folder.items.map((item) => {
            const Icon = fileIcon(item);
            const meta = [formatModified(item.modifiedAt), item.kind === "file" ? formatFileSize(item.sizeBytes) : null]
              .filter(Boolean)
              .join(" · ");
            const error = fileError?.fileId === item.id ? fileError.message : null;
            return (
              <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                {item.kind === "folder" ? (
                  <button
                    type="button"
                    onClick={() => openFolder(item.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left hover:underline"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">{meta}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-medium">{item.name}</span>
                        {item.deliveredAs === "pdf" ? <Badge variant="outline">PDF</Badge> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{meta}</span>
                    </span>
                  </div>
                )}

                {item.kind === "file" ? (
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {canPreview(item) ? (
                      <Button
                        variant="outline"
                        className="min-h-11 flex-1 sm:flex-none"
                        nativeButton={false}
                        render={
                          <a
                            href={portalFileUrl(projectId, item.id, "preview")}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ver ${item.name}`}
                          />
                        }
                      >
                        <Eye aria-hidden="true" />
                        Ver
                      </Button>
                    ) : null}
                    {item.deliveredAs === "pdf" ? (
                      <Button
                        className="min-h-11 flex-1 sm:flex-none"
                        aria-label={`Descargar ${item.name}`}
                        disabled={downloadingId === item.id}
                        onClick={() => downloadExport(item)}
                      >
                        {downloadingId === item.id ? (
                          <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                          <Download aria-hidden="true" />
                        )}
                        Descargar
                      </Button>
                    ) : (
                      <Button
                        className="min-h-11 flex-1 sm:flex-none"
                        nativeButton={false}
                        render={
                          <a
                            href={portalFileUrl(projectId, item.id, "download")}
                            download
                            aria-label={`Descargar ${item.name}`}
                          />
                        }
                      >
                        <Download aria-hidden="true" />
                        Descargar
                      </Button>
                    )}
                  </div>
                ) : null}

                {error ? (
                  <Alert className="sm:basis-full" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

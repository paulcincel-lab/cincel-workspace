"use client";

import { Fragment, type MouseEvent, type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FileText, Folder, FolderOpen, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { DataTable } from "@/components/ui/DataTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { retryProjectFolderAction, type RetryProjectFolderResult } from "@/lib/actions/projects-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { retryFolderKeys } from "@/lib/query/options/proyectos-archivos-clientes";
import type { StaffFileItem, StaffFilesResult } from "@/lib/types/workspace-access";

/** One-line hints for the project folder's three subfolders (FE §2.3), keyed by folder name. */
export const SUBFOLDER_HINTS: Record<string, string> = {
  "01 Interno": "Solo el equipo",
  "02 Cliente": "Lo ven los clientes invitados",
  "03 Del cliente": "Archivos que envían los clientes",
};

const RETRY_ERRORS: Record<"forbidden" | "not_found", string> = {
  forbidden: "No tienes permiso para crear la carpeta.",
  not_found: "El proyecto ya no existe.",
};

const RETRY_FAILED = "No se pudo reintentar. Intenta de nuevo.";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function formatModified(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("es-MX", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function archivosHref(projectId: string, folderId?: string | null): string {
  const base = `/proyectos/${encodeURIComponent(projectId)}/archivos`;
  return folderId ? `${base}?folder=${encodeURIComponent(folderId)}` : base;
}

/**
 * Opens a folder of the Archivos tab on the client (Query Migration 5d,
 * #962): `?folder=` is written with `history.pushState`, which Next syncs
 * into `useSearchParams` with no server render, and the tab reads
 * `proyectos.archivos(id, folder)`. Back and forward restore the folder.
 */
export function openArchivosFolder(projectId: string, folderId: string | null): void {
  window.history.pushState(null, "", archivosHref(projectId, folderId));
}

/** A plain left click the tab may take over; middle, modified and new-tab clicks keep the real link. */
export function isPlainLeftClick(event: MouseEvent<HTMLElement>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** `onClick` for a folder link: client navigation on a plain click, the `href` otherwise. */
export function folderLinkClick(projectId: string, folderId: string | null) {
  return (event: MouseEvent<HTMLElement>) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    openArchivosFolder(projectId, folderId);
  };
}

export function connectDriveHref(projectId: string): string {
  return `/api/auth/google/start?scope=drive&return_to=${encodeURIComponent(archivosHref(projectId))}`;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

type Props = {
  projectId: string;
  result: StaffFilesResult;
  /** `canEditProjectGeneral`: may run Reintentar carpeta. */
  canRetry: boolean;
};

/** Staff Archivos tab (FE §2.3): the project's Drive folder, or why it can't be shown. */
export function ProjectFilesBrowser({ projectId, result, canRetry }: Props) {
  switch (result.status) {
    case "pending":
      return (
        <FolderState projectId={projectId} canRetry={canRetry}>
          <Alert>
            <Loader2 />
            <AlertTitle>Creando la carpeta del proyecto…</AlertTitle>
            {result.error ? <AlertDescription>{result.error}</AlertDescription> : null}
          </Alert>
        </FolderState>
      );
    case "failed":
      return (
        <FolderState projectId={projectId} canRetry={canRetry}>
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>No se pudo crear la carpeta del proyecto en Drive.</AlertTitle>
            {result.error ? <AlertDescription>{result.error}</AlertDescription> : null}
          </Alert>
        </FolderState>
      );
    case "needs_consent":
      return (
        <Alert>
          <FolderOpen />
          <AlertTitle>Conecta tu cuenta de Google Drive para ver los archivos del proyecto.</AlertTitle>
          <AlertDescription>
            <a href={connectDriveHref(projectId)} className={buttonVariants({ size: "sm" })}>
              Conectar Google Drive
            </a>
          </AlertDescription>
        </Alert>
      );
    case "no_drive_access":
      return (
        <Alert>
          <ShieldAlert />
          <AlertTitle>No tienes acceso a esta carpeta en Drive.</AlertTitle>
        </Alert>
      );
    case "ok":
      return <FolderListing projectId={projectId} result={result} />;
  }
}

function FolderState({
  projectId,
  canRetry,
  children,
}: {
  projectId: string;
  canRetry: boolean;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useActionMutation<string, Extract<RetryProjectFolderResult, { ok: true }>>(retryProjectFolderAction, {
    // Only after a retry that ran: a refused one changes nothing.
    invalidate: (id, data) => (data ? retryFolderKeys(id) : []),
    // The error shows inline below the button, not as a toast.
    onFormError: () => undefined,
  });
  const pending = mutation.isPending;

  function retry() {
    setError(null);
    mutation.mutate(projectId, {
      onError: (err) =>
        setError(Object.hasOwn(RETRY_ERRORS, err.message) ? RETRY_ERRORS[err.message as keyof typeof RETRY_ERRORS] : RETRY_FAILED),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {children}
      {canRetry ? (
        <div>
          <Button variant="outline" size="sm" onClick={retry} disabled={pending}>
            <RefreshCw />
            {pending ? "Reintentando…" : "Reintentar carpeta"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

type OkResult = Extract<StaffFilesResult, { status: "ok" }>;

function FolderListing({ projectId, result }: { projectId: string; result: OkResult }) {
  const root = result.breadcrumbs[0] ?? { id: result.folderId, name: "Proyecto" };
  const atRoot = result.folderId === root.id;

  const columns = useMemo<ColumnDef<StaffFileItem, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Nombre",
        enableSorting: false,
        cell: ({ row }) => <FileName projectId={projectId} item={row.original} hint={atRoot} />,
      },
      {
        id: "modifiedAt",
        header: "Modificado",
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{formatModified(row.original.modifiedAt)}</span>,
      },
      {
        id: "size",
        header: "Tamaño",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.kind === "folder" ? "—" : formatSize(row.original.sizeBytes)}
          </span>
        ),
      },
    ],
    [projectId, atRoot]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FolderBreadcrumbs projectId={projectId} breadcrumbs={result.breadcrumbs} rootId={root.id} />
        <a
          href={driveFolderUrl(root.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink />
          Abrir en Drive
        </a>
      </div>
      <DataTable
        columns={columns}
        data={result.items}
        getRowId={(item) => item.id}
        emptyMessage="Esta carpeta está vacía."
      />
    </div>
  );
}

export function FolderBreadcrumbs({
  projectId,
  breadcrumbs,
  rootId,
}: {
  projectId: string;
  breadcrumbs: { id: string; name: string }[];
  rootId: string;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => {
          const last = index === breadcrumbs.length - 1;
          return (
            <Fragment key={crumb.id}>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <a
                        href={archivosHref(projectId, crumb.id === rootId ? null : crumb.id)}
                        onClick={folderLinkClick(projectId, crumb.id === rootId ? null : crumb.id)}
                      />
                    }
                  >
                    {crumb.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function FileName({ projectId, item, hint }: { projectId: string; item: StaffFileItem; hint: boolean }) {
  const subfolderHint = hint && item.kind === "folder" ? SUBFOLDER_HINTS[item.name] : undefined;

  const label =
    item.kind === "folder" ? (
      <a
        href={archivosHref(projectId, item.id)}
        onClick={folderLinkClick(projectId, item.id)}
        className="inline-flex items-center gap-2 font-medium hover:underline"
      >
        <Folder aria-hidden className="size-4" />
        {item.name}
      </a>
    ) : item.webViewLink ? (
      <a
        href={item.webViewLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 hover:underline"
      >
        <FileText aria-hidden className="size-4" />
        {item.name}
      </a>
    ) : (
      <span className="inline-flex items-center gap-2">
        <FileText aria-hidden className="size-4" />
        {item.name}
      </span>
    );

  return (
    <div className="flex flex-col">
      {label}
      {subfolderHint ? <span className="text-xs text-muted-foreground">{subfolderHint}</span> : null}
    </div>
  );
}

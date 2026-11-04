"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { CircleAlert, CircleCheck, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import type { PortalUploadDTO } from "@/lib/types/portal";

/**
 * Extensions clients may send. Mirrors `UPLOAD_ALLOWED_EXTENSIONS` in `lib/portal/upload-validation.ts`
 * (server-only, it pulls `file-type`); the test keeps both lists equal. The server still decides.
 */
export const PORTAL_UPLOAD_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "heic",
  "docx",
  "xlsx",
  "pptx",
  "zip",
  "doc",
  "xls",
  "ppt",
  "dwg",
  "dxf",
] as const;

/** `accept` attribute for the file input. */
export const PORTAL_UPLOAD_ACCEPT = PORTAL_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export const PORTAL_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const PORTAL_UPLOAD_MESSAGES = {
  tooLarge: "El archivo supera 50 MB",
  unsupported: "Tipo de archivo no permitido",
  notReady: "Aún no puedes enviar archivos a este proyecto",
  failed: "No se pudo enviar el archivo; intenta de nuevo",
} as const;

export const PORTAL_UPLOADS_EMPTY = "Aún no has enviado archivos.";

function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

/** Client-side check before any request: extension allowlist, then the 50 MB limit. Null when the file can go. */
export function checkPortalUploadFile(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (!ext || !(PORTAL_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return PORTAL_UPLOAD_MESSAGES.unsupported;
  if (file.size > PORTAL_UPLOAD_MAX_BYTES) return PORTAL_UPLOAD_MESSAGES.tooLarge;
  return null;
}

/** Response status → per-file message (FE §3.3). */
export function portalUploadErrorMessage(status: number): string {
  if (status === 413) return PORTAL_UPLOAD_MESSAGES.tooLarge;
  if (status === 415) return PORTAL_UPLOAD_MESSAGES.unsupported;
  if (status === 409) return PORTAL_UPLOAD_MESSAGES.notReady;
  return PORTAL_UPLOAD_MESSAGES.failed;
}

export function formatPortalBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatPortalUploadDate(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : DATE_FORMAT.format(date).replaceAll("/", "-");
}

export type PortalUploadResult =
  | { ok: true; upload: PortalUploadDTO }
  | { ok: false; status: number; message: string; redirect?: string };

export type XhrFactory = () => XMLHttpRequest;

function uploadsUrl(projectId: string): string {
  return `/api/portal/projects/${encodeURIComponent(projectId)}/uploads`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** One multipart `file` per request, with upload progress (0–100) from `XMLHttpRequest` events. */
export function uploadPortalFile(
  projectId: string,
  file: File,
  onProgress: (pct: number) => void,
  createXhr: XhrFactory = () => new XMLHttpRequest()
): Promise<PortalUploadResult> {
  return new Promise((resolve) => {
    const xhr = createXhr();
    xhr.open("POST", uploadsUrl(projectId));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      const body = parseJson(xhr.responseText) as Record<string, unknown> | null;
      if (xhr.status === 201 && body) {
        onProgress(100);
        resolve({ ok: true, upload: body as unknown as PortalUploadDTO });
        return;
      }
      const redirect = xhr.status === 401 && typeof body?.redirect === "string" ? body.redirect : undefined;
      resolve({ ok: false, status: xhr.status, message: portalUploadErrorMessage(xhr.status), redirect });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, message: PORTAL_UPLOAD_MESSAGES.failed });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

type ItemState =
  | { id: number; name: string; size: number; status: "uploading"; pct: number }
  | { id: number; name: string; size: number; status: "done" }
  | { id: number; name: string; size: number; status: "error"; message: string };

type Props = {
  projectId: string;
  /** Test seam for upload progress; defaults to the browser's XMLHttpRequest. */
  createXhr?: XhrFactory;
  /** Called on 401 with the portal sign-in path. */
  onUnauthorized?: (redirect: string) => void;
};

function goTo(path: string) {
  window.location.assign(path);
}

/**
 * Enviar archivos tab (FE §3.3): drop zone + file button, one request per file with its own progress and error,
 * then **Mis envíos** from `GET /api/portal/projects/[pid]/uploads`.
 */
export default function PortalUploader({ projectId, createXhr, onUnauthorized = goTo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [items, setItems] = useState<ItemState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<PortalUploadDTO[] | null>(null);
  const [uploadsFailed, setUploadsFailed] = useState(false);

  const loadUploads = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(uploadsUrl(projectId), { signal, cache: "no-store" });
        if (response.status === 401) {
          const body = (await response.json().catch(() => null)) as { redirect?: string } | null;
          onUnauthorized(body?.redirect ?? "/portal/login");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        setUploads((await response.json()) as PortalUploadDTO[]);
        setUploadsFailed(false);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setUploadsFailed(true);
      }
    },
    [projectId, onUnauthorized]
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUploads(controller.signal);
    return () => controller.abort();
  }, [loadUploads]);

  const update = useCallback((id: number, next: ItemState) => {
    setItems((current) => current.map((item) => (item.id === id ? next : item)));
  }, []);

  const startFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = nextId.current++;
        const base = { id, name: file.name, size: file.size };
        const rejected = checkPortalUploadFile(file);
        if (rejected) {
          setItems((current) => [...current, { ...base, status: "error", message: rejected }]);
          continue;
        }
        setItems((current) => [...current, { ...base, status: "uploading", pct: 0 }]);
        void uploadPortalFile(projectId, file, (pct) => update(id, { ...base, status: "uploading", pct }), createXhr).then(
          (result) => {
            if (result.ok) {
              update(id, { ...base, status: "done" });
              void loadUploads();
              return;
            }
            if (result.redirect) {
              onUnauthorized(result.redirect);
              return;
            }
            update(id, { ...base, status: "error", message: result.message });
          }
        );
      }
    },
    [projectId, createXhr, update, loadUploads, onUnauthorized]
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    startFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Enviar archivos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            data-testid="portal-drop-zone"
            data-dragging={dragging ? "true" : undefined}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center data-[dragging=true]:bg-muted"
          >
            <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Arrastra tus archivos aquí o elígelos desde tu dispositivo.</p>
            <Button type="button" className="min-h-11" onClick={() => inputRef.current?.click()}>
              Elegir archivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={PORTAL_UPLOAD_ACCEPT}
              aria-label="Elegir archivos"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                startFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              Hasta 50 MB por archivo. PDF, imágenes, Office, ZIP, DWG y DXF.
            </p>
          </div>

          {items.length > 0 ? (
            <ul aria-label="Archivos en envío" className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{item.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatPortalBytes(item.size)}</span>
                  </div>
                  {item.status === "uploading" ? (
                    <Progress value={item.pct} aria-label={`Enviando ${item.name}`} />
                  ) : item.status === "done" ? (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CircleCheck aria-hidden="true" className="size-4" />
                      Enviado
                    </p>
                  ) : (
                    <Alert variant="destructive">
                      <CircleAlert aria-hidden="true" />
                      <AlertDescription>{item.message}</AlertDescription>
                    </Alert>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis envíos</CardTitle>
        </CardHeader>
        <CardContent>
          {uploadsFailed ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>No pudimos cargar tus envíos. Recarga la página.</AlertDescription>
            </Alert>
          ) : uploads === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">{PORTAL_UPLOADS_EMPTY}</p>
          ) : (
            <ul aria-label="Mis envíos" className="flex flex-col divide-y">
              {uploads.map((upload) => (
                <li key={upload.id} className="flex min-w-0 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1 break-words text-sm">{upload.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatPortalBytes(upload.sizeBytes)} · {formatPortalUploadDate(upload.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

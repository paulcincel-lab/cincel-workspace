import { isDriveNotFound, isExportTooLarge, type DriveAdmin, type DriveFile } from "@/lib/google/drive-admin";
import { isPortalNotFound, type DriveGuardProject } from "@/lib/portal/drive-guard";
import { PDF_EXPORTABLE_MIME_TYPES } from "@/lib/portal/files";

/**
 * Portal file download and preview (backend spec §B.4.5, review NB 1).
 *
 * Every call runs the ancestry guard first, so only files under the project's
 * `02 Cliente` folder are reachable; anything else answers 404. Google-native
 * documents are exported to PDF (Drive caps exports at 10 MB → 422
 * `export_too_large`); other files are streamed from Drive without buffering.
 * Each successful call is recorded in `portal_file_events`.
 *
 * The guard, the Drive client and the event writer are passed in (see
 * lib/portal/file-route.ts for the wiring), which keeps this unit-testable.
 */

export type PortalFileKind = "download" | "preview";

export const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";
export const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const PDF_MIME_TYPE = "application/pdf";

/** Types the preview route renders inline. SVG and everything else → 415. */
export const PREVIEW_MIME_TYPES: ReadonlySet<string> = new Set([
  PDF_MIME_TYPE,
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Downloads and image previews: no scripts, no plugins, a unique opaque origin. */
export const CSP_SANDBOXED = "sandbox; default-src 'none'";
/** PDF previews: browser PDF viewers refuse sandboxed documents, so no `sandbox` here. */
export const CSP_PDF_PREVIEW = "default-src 'none'; object-src 'self'";

export const EXPORT_TOO_LARGE_MESSAGE = "Este documento es muy grande; pide el PDF a tu equipo.";

const FILE_FIELDS = "id,name,mimeType,size,trashed";
const MAX_FILENAME_LENGTH = 200;
const FALLBACK_FILENAME = "archivo";

/** Lowercase type without parameters (`image/PNG; x=y` → `image/png`). */
export function baseMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0].trim().toLowerCase();
}

export function isGoogleNative(mimeType: string): boolean {
  return baseMimeType(mimeType).startsWith(GOOGLE_NATIVE_PREFIX);
}

export function isPreviewable(mimeType: string): boolean {
  return PREVIEW_MIME_TYPES.has(baseMimeType(mimeType));
}

/**
 * Filename safe for a header and for the client's disk: control characters,
 * path separators and characters Windows rejects are replaced, surrounding dots
 * and spaces are trimmed, and the length is capped while keeping the extension.
 */
export function sanitizeFilename(name: string): string {
  let clean = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (clean.length > MAX_FILENAME_LENGTH) {
    const dot = clean.lastIndexOf(".");
    const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
    clean = clean.slice(0, MAX_FILENAME_LENGTH - ext.length).trimEnd() + ext;
  }
  return clean || FALLBACK_FILENAME;
}

/** ASCII-only fallback for the plain `filename=` parameter (accents dropped, the rest replaced). */
export function asciiFilename(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\%]/g, "_");
  return ascii.trim() || FALLBACK_FILENAME;
}

/** RFC 5987 value encoding: encodeURIComponent plus the characters it leaves that attr-char forbids. */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** RFC 6266 `Content-Disposition` with an ASCII fallback and the UTF-8 `filename*`. */
export function contentDisposition(type: "inline" | "attachment", name: string): string {
  const safe = sanitizeFilename(name);
  return `${type}; filename="${asciiFilename(safe)}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}

/** Name of an exported Google-native document: always ends in `.pdf`. */
export function exportedFilename(name: string): string {
  const trimmed = name.trim();
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed || FALLBACK_FILENAME}.pdf`;
}

/** CSP per response kind (review NB 1). */
export function contentSecurityPolicy(kind: PortalFileKind, contentType: string): string {
  return kind === "preview" && baseMimeType(contentType) === PDF_MIME_TYPE ? CSP_PDF_PREVIEW : CSP_SANDBOXED;
}

export type PortalFileEventInput = {
  portalUserId: string;
  projectId: string;
  driveFileId: string;
  fileName: string;
  sizeBytes: number | null;
  action: PortalFileKind;
  ip: string | null;
  userAgent: string | null;
};

export type PortalFileDeps = {
  /** lib/portal/drive-guard.ts; throws PortalNotFoundError outside `02 Cliente`. */
  assertInsideClientFolder(fileId: string, project: DriveGuardProject): Promise<unknown>;
  /** Service-account Drive client; null when it isn't configured. */
  drive: Pick<DriveAdmin, "get" | "getMedia" | "export"> | null;
  recordEvent(event: PortalFileEventInput): Promise<void>;
};

export type PortalFileRequest = {
  kind: PortalFileKind;
  fileId: string;
  project: DriveGuardProject & { projectId: string };
  portalUserId: string;
  ip: string | null;
  userAgent: string | null;
};

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json(message ? { error, message } : { error }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const portalFileNotFound = () => jsonError(404, "not_found");

function parseSize(size: string | undefined): number | null {
  if (size === undefined) return null;
  const n = Number(size);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Streams one portal file as a download or an inline preview. Never throws for expected outcomes. */
export async function deliverPortalFile(request: PortalFileRequest, deps: PortalFileDeps): Promise<Response> {
  const { kind, fileId, project } = request;

  let file: DriveFile;
  try {
    // Mandatory: 01 Interno, other projects, trashed and unknown ids all end here as 404.
    await deps.assertInsideClientFolder(fileId, project);
    if (!deps.drive) return portalFileNotFound();
    file = await deps.drive.get(fileId, FILE_FIELDS);
  } catch (error) {
    if (isPortalNotFound(error) || isDriveNotFound(error)) return portalFileNotFound();
    throw error;
  }
  if (file.trashed) return portalFileNotFound();

  const sourceType = baseMimeType(file.mimeType);
  if (sourceType === GOOGLE_FOLDER_MIME_TYPE) return jsonError(400, "is_folder");

  const native = isGoogleNative(sourceType);
  if (native && !PDF_EXPORTABLE_MIME_TYPES.has(sourceType)) return jsonError(415, "unsupported_type");

  const contentType = native ? PDF_MIME_TYPE : sourceType || "application/octet-stream";
  if (kind === "preview" && !isPreviewable(contentType)) return jsonError(415, "unsupported_type");

  let media;
  try {
    media = native ? await deps.drive.export(fileId, PDF_MIME_TYPE) : await deps.drive.getMedia(fileId);
  } catch (error) {
    if (isExportTooLarge(error)) return jsonError(422, "export_too_large", EXPORT_TOO_LARGE_MESSAGE);
    if (isDriveNotFound(error)) return portalFileNotFound();
    throw error;
  }

  const fileName = native ? exportedFilename(file.name) : file.name;
  const sizeBytes = native ? media.size : (parseSize(file.size) ?? media.size);

  try {
    await deps.recordEvent({
      portalUserId: request.portalUserId,
      projectId: project.projectId,
      driveFileId: fileId,
      fileName,
      sizeBytes,
      action: kind,
      ip: request.ip,
      userAgent: request.userAgent,
    });
  } catch (error) {
    // No audit row, no file: release the Drive stream and fail.
    await media.body.cancel().catch(() => undefined);
    throw error;
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": contentDisposition(kind === "preview" ? "inline" : "attachment", fileName),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": contentSecurityPolicy(kind, contentType),
  });
  // Drive's own byte count, not the upstream Content-Length, which can describe a compressed body.
  const declaredSize = native ? null : parseSize(file.size);
  if (declaredSize !== null) headers.set("Content-Length", String(declaredSize));

  return new Response(media.body, { status: 200, headers });
}

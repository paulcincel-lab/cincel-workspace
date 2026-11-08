import { queryOptions } from "@tanstack/react-query";

import type { PortalHomeData, PortalProjectData } from "@/lib/loaders/portal";
import { getPortalHomeData, getPortalProjectData } from "@/lib/portal/page-data";
import type { PortalProjectTab } from "@/lib/portal/project-tabs";
import { STALE, qk } from "@/lib/query/keys";
import type { PortalFolderDTO, PortalUploadDTO } from "@/lib/types/portal";

/**
 * Client portal queries (Query Migration Phase 11, plan §4.3 Portal). Every
 * `portal.*` key is 60 s stale; the whole cache is cleared on portal logout.
 *
 * - `portal.projects()` and `portal.project(id, tab)` read the page-data
 *   actions in `lib/portal/page-data.ts`; the server pages seed them.
 * - `portal.files(id, folder)` and `portal.uploads(id)` wrap the existing GET
 *   route handlers. An upload invalidates `portal.uploads(id)`.
 *
 * Query functions are side-effect free: a 401 becomes a `PortalSignedOutError`
 * and the component follows its `redirect`.
 */

/** Sign-in page a 401 points to when its body carries no usable `redirect`. */
export const PORTAL_SIGN_IN_FALLBACK = "/portal/login";

/** A portal route answered 401: the session is gone. `redirect` is a same-origin path. */
export class PortalSignedOutError extends Error {
  readonly redirect: string;

  constructor(redirect: string) {
    super("PORTAL_UNAUTHENTICATED");
    this.name = "PortalSignedOutError";
    this.redirect = redirect;
  }
}

/** A portal route answered with an unexpected status (5xx, 503 `drive_unavailable`, …). */
export class PortalRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`PORTAL_REQUEST_${status}`);
    this.name = "PortalRequestError";
    this.status = status;
  }
}

export function isPortalSignedOut(error: unknown): error is PortalSignedOutError {
  return error instanceof PortalSignedOutError;
}

/** Every portal route answers 401 `{ redirect }` without a session (FE §7.2). */
async function signedOutError(response: Response): Promise<PortalSignedOutError> {
  const body = (await response.json().catch(() => null)) as { redirect?: unknown } | null;
  const target =
    typeof body?.redirect === "string" && body.redirect.startsWith("/") && !body.redirect.startsWith("//")
      ? body.redirect
      : PORTAL_SIGN_IN_FALLBACK;
  return new PortalSignedOutError(target);
}

export function portalFilesUrl(projectId: string, folderId: string | null): string {
  const base = `/api/portal/projects/${encodeURIComponent(projectId)}/files`;
  return folderId ? `${base}?folder=${encodeURIComponent(folderId)}` : base;
}

export function portalUploadsUrl(projectId: string): string {
  return `/api/portal/projects/${encodeURIComponent(projectId)}/uploads`;
}

// ── Page data ────────────────────────────────────────────────────────────────

/** `portal.projects()`: the landing page's projects. */
export function portalHomeOptions() {
  return queryOptions<PortalHomeData>({
    queryKey: qk.portal.projects(),
    queryFn: () => getPortalHomeData({}),
    staleTime: STALE.portal,
  });
}

/** `portal.project(id, tab)`: one project tab; null when the client has no access (the page shows a 404). */
export function portalProjectOptions(projectId: string, tab: PortalProjectTab) {
  return queryOptions<PortalProjectData | null>({
    queryKey: qk.portal.project(projectId, tab),
    queryFn: () => getPortalProjectData({ id: projectId, tab }),
    staleTime: STALE.portal,
  });
}

// ── Route handlers ───────────────────────────────────────────────────────────

/** What `GET …/files?folder` means for the browser: a listing, folders not ready yet, or an unknown folder. */
export type PortalFilesData =
  | { status: "ok"; folder: PortalFolderDTO }
  | { status: "pending" }
  | { status: "not_found" };

export async function fetchPortalFiles(
  projectId: string,
  folderId: string | null,
  signal?: AbortSignal,
): Promise<PortalFilesData> {
  const response = await fetch(portalFilesUrl(projectId, folderId), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) throw await signedOutError(response);
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) throw new PortalRequestError(response.status);
  const body = (await response.json()) as PortalFolderDTO | { pending: true };
  if ("pending" in body && body.pending) return { status: "pending" };
  return { status: "ok", folder: body as PortalFolderDTO };
}

/**
 * `portal.files(id, folder)`: one folder of the project's `02 Cliente` (null is its top). Changing folder
 * cancels the previous request (the query consumes the abort signal).
 */
export function portalFilesOptions(projectId: string, folderId: string | null) {
  return queryOptions<PortalFilesData>({
    queryKey: qk.portal.files(projectId, folderId),
    queryFn: ({ signal }) => fetchPortalFiles(projectId, folderId, signal),
    staleTime: STALE.portal,
  });
}

export async function fetchPortalUploads(projectId: string, signal?: AbortSignal): Promise<PortalUploadDTO[]> {
  const response = await fetch(portalUploadsUrl(projectId), { signal, cache: "no-store" });
  if (response.status === 401) throw await signedOutError(response);
  if (!response.ok) throw new PortalRequestError(response.status);
  return (await response.json()) as PortalUploadDTO[];
}

/** `portal.uploads(id)`: **Mis envíos**, the files this client sent. Invalidated when an upload finishes. */
export function portalUploadsOptions(projectId: string) {
  return queryOptions<PortalUploadDTO[]>({
    queryKey: qk.portal.uploads(projectId),
    queryFn: ({ signal }) => fetchPortalUploads(projectId, signal),
    staleTime: STALE.portal,
  });
}

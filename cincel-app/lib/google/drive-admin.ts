import { createServiceAccountJwt } from "./service-account";

/**
 * Drive v3 client that acts as the service account itself (no domain-wide
 * delegation, no `subject`), as a Content manager of the company Shared Drive.
 * Used for project folders, the monday import (upload and rollback trash) and,
 * later, the Client Portal file routes.
 *
 * Credentials are passed in, never read here, and this module has no
 * `server-only` import, so both the app and the `npm run monday` CLI can use
 * it. Every call sends `supportsAllDrives=true`; lists also send
 * `includeItemsFromAllDrives=true`.
 */

export const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** Fields returned for a file unless the caller asks for others. */
export const DEFAULT_FILE_FIELDS = "id,name,mimeType,parents,trashed,size,modifiedTime";

export type DriveAdminCredentials = {
  clientEmail: string;
  /** PEM key; a literal `\n` (as stored in env files) is turned into a newline. */
  privateKey: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type DriveAdminOptions = {
  /** Service account credentials. Required unless `getAccessToken` is given. */
  credentials?: DriveAdminCredentials;
  /** Overrides how the bearer token is obtained (tests, or a shared JWT). */
  getAccessToken?: () => Promise<string>;
  fetch?: FetchLike;
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  /** Drive returns it as a decimal string; absent for folders and native docs. */
  size?: string;
  modifiedTime?: string;
  /** Only when asked for in `fields`. */
  createdTime?: string;
  /** Only when asked for in `fields`. */
  webViewLink?: string;
  /** Only when asked for in `fields`. */
  iconLink?: string;
  /** Only when asked for in `fields`. */
  thumbnailLink?: string;
};

export type DriveFileList = { files: DriveFile[]; nextPageToken?: string };

export type ListOptions = {
  /** Lists the direct children of this folder. */
  parentId?: string;
  /** Extra query clause, joined with `and` (e.g. `mimeType = '...'`). */
  q?: string;
  /** Trashed files are left out unless this is true. */
  includeTrashed?: boolean;
  /** Restricts the search to one Shared Drive (`corpora=drive`). */
  driveId?: string;
  pageSize?: number;
  pageToken?: string;
  /** File fields to return; defaults to DEFAULT_FILE_FIELDS. */
  fields?: string;
  orderBy?: string;
};

export type MediaResponse = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** Bytes, when Drive sent a Content-Length. */
  size: number | null;
};

export type UploadBody = ReadableStream<Uint8Array> | Uint8Array | Blob | ArrayBuffer;

export type UploadInput = {
  name: string;
  parentId: string;
  mimeType: string;
  body: UploadBody;
  /** Byte length; required for a stream so Drive knows when the upload ends. */
  size?: number;
  fields?: string;
};

export type DriveAdmin = {
  createFolder(name: string, parentId: string): Promise<DriveFile>;
  rename(fileId: string, name: string): Promise<DriveFile>;
  /** id, name, parents and trashed (plus the default fields). */
  get(fileId: string, fields?: string): Promise<DriveFile>;
  /** The file's parent ids (empty for a Shared Drive root). */
  getParents(fileId: string): Promise<string[]>;
  list(options?: ListOptions): Promise<DriveFileList>;
  /** Follows nextPageToken until the list is complete. */
  listAll(options?: Omit<ListOptions, "pageToken">): Promise<DriveFile[]>;
  /** Streams a binary file's content (`alt=media`). */
  getMedia(fileId: string): Promise<MediaResponse>;
  /** Streams a Google-native document converted to `mimeType` (e.g. application/pdf). */
  export(fileId: string, mimeType: string): Promise<MediaResponse>;
  /** Opens a resumable upload session and returns its session URL. */
  startResumableUpload(input: Omit<UploadInput, "body">): Promise<string>;
  /** Resumable upload in one request: opens the session, then sends the body. */
  uploadResumable(input: UploadInput): Promise<DriveFile>;
  /** Moves a file or folder to the trash (recoverable for 30 days). */
  trash(fileId: string): Promise<DriveFile>;
};

export class DriveAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Drive's `errors[0].reason`, e.g. `notFound`, `exportSizeLimitExceeded`. */
    readonly reason: string | null = null
  ) {
    super(message);
    this.name = "DriveAdminError";
  }
}

export function isDriveNotFound(error: unknown): boolean {
  return error instanceof DriveAdminError && error.status === 404;
}

/** Drive refuses to export native documents larger than 10 MB. */
export function isExportTooLarge(error: unknown): boolean {
  return error instanceof DriveAdminError && error.reason === "exportSizeLimitExceeded";
}

/** Escapes a value for use inside a single-quoted Drive query string. */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Builds the `q` parameter for a list call. */
export function buildListQuery(options: Pick<ListOptions, "parentId" | "q" | "includeTrashed">): string | undefined {
  const clauses: string[] = [];
  if (options.parentId) clauses.push(`'${escapeQueryValue(options.parentId)}' in parents`);
  if (!options.includeTrashed) clauses.push("trashed = false");
  if (options.q) clauses.push(`(${options.q})`);
  return clauses.length ? clauses.join(" and ") : undefined;
}

function serviceAccountTokenSource(credentials: DriveAdminCredentials): () => Promise<string> {
  const jwt = createServiceAccountJwt(credentials, [DRIVE_SCOPE]);
  return async () => {
    const { token } = await jwt.getAccessToken();
    if (!token) throw new DriveAdminError("No se obtuvo un token de la cuenta de servicio", 401);
    return token;
  };
}

async function toDriveError(response: Response): Promise<DriveAdminError> {
  let message = `Google Drive respondió ${response.status}`;
  let reason: string | null = null;
  try {
    const data = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    if (data.error?.message) message = data.error.message;
    reason = data.error?.errors?.[0]?.reason ?? null;
  } catch {
    // Non-JSON error body: keep the status message.
  }
  return new DriveAdminError(message, response.status, reason);
}

function withParams(base: string, params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return `${base}?${search.toString()}`;
}

function toMedia(response: Response): MediaResponse {
  if (!response.body) throw new DriveAdminError("Google Drive no devolvió contenido", response.status);
  const length = response.headers.get("content-length");
  return {
    body: response.body,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    size: length === null ? null : Number(length),
  };
}

export function createDriveAdmin(options: DriveAdminOptions): DriveAdmin {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const getAccessToken =
    options.getAccessToken ??
    (options.credentials ? serviceAccountTokenSource(options.credentials) : null);
  if (!getAccessToken) throw new Error("createDriveAdmin needs credentials or getAccessToken");

  async function send(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken!();
    const response = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw await toDriveError(response);
    return response;
  }

  async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = init.body === undefined ? init.headers : { ...init.headers, "Content-Type": "application/json" };
    const response = await send(url, { ...init, headers });
    return (await response.json()) as T;
  }

  const fileUrl = (fileId: string, params: Record<string, string | number | boolean | undefined> = {}) =>
    withParams(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}`, { supportsAllDrives: true, ...params });

  async function patch(fileId: string, body: Record<string, unknown>): Promise<DriveFile> {
    return json<DriveFile>(fileUrl(fileId, { fields: DEFAULT_FILE_FIELDS }), {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  const admin: DriveAdmin = {
    createFolder(name, parentId) {
      return json<DriveFile>(withParams(`${DRIVE_API_URL}/files`, { supportsAllDrives: true, fields: DEFAULT_FILE_FIELDS }), {
        method: "POST",
        body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
      });
    },

    rename(fileId, name) {
      return patch(fileId, { name });
    },

    get(fileId, fields = DEFAULT_FILE_FIELDS) {
      return json<DriveFile>(fileUrl(fileId, { fields }));
    },

    async getParents(fileId) {
      const file = await json<DriveFile>(fileUrl(fileId, { fields: "id,parents" }));
      return file.parents ?? [];
    },

    list(listOptions = {}) {
      const fields = listOptions.fields ?? DEFAULT_FILE_FIELDS;
      return json<DriveFileList>(
        withParams(`${DRIVE_API_URL}/files`, {
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          q: buildListQuery(listOptions),
          corpora: listOptions.driveId ? "drive" : undefined,
          driveId: listOptions.driveId,
          pageSize: listOptions.pageSize,
          pageToken: listOptions.pageToken,
          orderBy: listOptions.orderBy,
          fields: `nextPageToken,files(${fields})`,
        })
      ).then((page) => ({ files: page.files ?? [], nextPageToken: page.nextPageToken }));
    },

    async listAll(listOptions = {}) {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const page = await admin.list({ ...listOptions, pageToken });
        files.push(...page.files);
        pageToken = page.nextPageToken;
      } while (pageToken);
      return files;
    },

    async getMedia(fileId) {
      return toMedia(await send(fileUrl(fileId, { alt: "media" })));
    },

    async export(fileId, mimeType) {
      return toMedia(
        await send(withParams(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/export`, { supportsAllDrives: true, mimeType }))
      );
    },

    async startResumableUpload({ name, parentId, mimeType, size, fields = DEFAULT_FILE_FIELDS }) {
      const response = await send(
        withParams(`${DRIVE_UPLOAD_URL}/files`, { uploadType: "resumable", supportsAllDrives: true, fields }),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mimeType,
            ...(size === undefined ? {} : { "X-Upload-Content-Length": String(size) }),
          },
          body: JSON.stringify({ name, parents: [parentId], mimeType }),
        }
      );
      const location = response.headers.get("location");
      if (!location) throw new DriveAdminError("Google Drive no devolvió la sesión de carga", response.status);
      return location;
    },

    async uploadResumable(input) {
      const size =
        input.size ??
        (input.body instanceof Blob
          ? input.body.size
          : input.body instanceof ArrayBuffer || input.body instanceof Uint8Array
            ? input.body.byteLength
            : undefined);
      if (size === undefined) throw new Error("uploadResumable needs `size` for a stream body");
      const sessionUrl = await admin.startResumableUpload({ ...input, size });
      const isStream = typeof ReadableStream !== "undefined" && input.body instanceof ReadableStream;
      const response = await send(sessionUrl, {
        method: "PUT",
        headers: { "Content-Type": input.mimeType, "Content-Length": String(size) },
        body: input.body as BodyInit,
        // Node's fetch needs half-duplex to send a streamed request body.
        ...(isStream ? ({ duplex: "half" } as RequestInit) : {}),
      });
      return (await response.json()) as DriveFile;
    },

    trash(fileId) {
      return patch(fileId, { trashed: true });
    },
  };

  return admin;
}

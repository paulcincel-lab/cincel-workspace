import "server-only";

import { getDriveClientFor } from "@/lib/google/client";
import { getOauthAccessToken } from "@/lib/google/oauth";
import { driveWebViewLink } from "@/lib/google/drive-url";

/** Whoever is browsing Drive: their own connected OAuth account is tried first. */
export type DriveCaller = { staffId: string; email: string };

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FILE_FIELDS =
  "id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,parents";

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  thumbnailLink: string | null;
  webViewLink: string;
  modifiedTime: string | null;
  isFolder: boolean;
};

export type DriveListing = {
  entries: DriveEntry[];
  nextPageToken: string | null;
};

type RawFile = {
  id: string;
  name?: string;
  mimeType?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
};

function normalize(raw: RawFile): DriveEntry {
  const isFolder = raw.mimeType === FOLDER_MIME;
  return {
    id: raw.id,
    name: raw.name ?? "(sin nombre)",
    mimeType: raw.mimeType ?? "application/octet-stream",
    iconLink: raw.iconLink ?? null,
    thumbnailLink: raw.thumbnailLink ?? null,
    webViewLink: raw.webViewLink ?? driveWebViewLink(raw.id, isFolder),
    modifiedTime: raw.modifiedTime ?? null,
    isFolder,
  };
}

async function resolveAccessToken(caller: DriveCaller): Promise<string> {
  const oauth = await getOauthAccessToken(caller.staffId);
  if (oauth) return oauth.token;

  const client = getDriveClientFor(caller.email);
  if (!client) throw new Error("DRIVE_NOT_CONFIGURED");
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("DRIVE_AUTH_FAILED");
  return token;
}

async function driveFetch<T>(
  caller: DriveCaller,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const token = await resolveAccessToken(caller);

  const qs = new URLSearchParams({
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    ...params,
  });
  const res = await fetch(`${DRIVE_API}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DRIVE_API_${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Immediate children of `folderId`, folders first then files, name-sorted.
 * Scoped to `caller`'s own connected Google account when they have one,
 * else to what their institutional identity can see in Drive (see
 * lib/google/client.ts and lib/google/oauth.ts).
 */
export async function listFolder(
  caller: DriveCaller,
  folderId: string,
  pageToken?: string
): Promise<DriveListing> {
  const data = await driveFetch<{ files?: RawFile[]; nextPageToken?: string }>(
    caller,
    "/files",
    {
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      orderBy: "folder,name",
      pageSize: "200",
      ...(pageToken ? { pageToken } : {}),
    }
  );
  return {
    entries: (data.files ?? []).map(normalize),
    nextPageToken: data.nextPageToken ?? null,
  };
}

export async function getFileMeta(
  caller: DriveCaller,
  fileId: string
): Promise<DriveEntry> {
  const raw = await driveFetch<RawFile>(
    caller,
    `/files/${encodeURIComponent(fileId)}`,
    { fields: FILE_FIELDS }
  );
  return normalize(raw);
}

/** Full-text search, optionally scoped to a folder. Scoped per `caller`. */
export async function searchFiles(
  caller: DriveCaller,
  query: string,
  folderId?: string
): Promise<DriveEntry[]> {
  const escaped = query.replace(/['\\]/g, "\\$&");
  const clauses = [`name contains '${escaped}'`, "trashed = false"];
  if (folderId) clauses.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);

  const data = await driveFetch<{ files?: RawFile[] }>(caller, "/files", {
    q: clauses.join(" and "),
    fields: `files(${FILE_FIELDS})`,
    orderBy: "folder,name",
    pageSize: "100",
  });
  return (data.files ?? []).map(normalize);
}

const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";
/** Largest file we'll proxy through the app for in-page preview. */
export const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;

export type DriveFileContent = {
  name: string;
  /** What the bytes actually are — a PDF for Google-native docs, which get exported. */
  mimeType: string;
  body: ReadableStream<Uint8Array>;
};

/**
 * The bytes of a file, fetched as `caller`'s connected Google account (or
 * institutional identity), so previews work regardless of which Google
 * account the browser happens to be signed into. Google-native docs/sheets/
 * slides can't be downloaded directly, so they're exported as PDF.
 */
export async function getFileContent(caller: DriveCaller, fileId: string): Promise<DriveFileContent> {
  const meta = await driveFetch<RawFile & { size?: string }>(
    caller,
    `/files/${encodeURIComponent(fileId)}`,
    { fields: "id,name,mimeType,size" }
  );
  const mimeType = meta.mimeType ?? "application/octet-stream";
  if (mimeType === FOLDER_MIME) throw new Error("DRIVE_IS_FOLDER");
  if (meta.size && Number(meta.size) > MAX_PREVIEW_BYTES) throw new Error("DRIVE_TOO_LARGE");

  const isNative = mimeType.startsWith(GOOGLE_NATIVE_PREFIX);
  const token = await resolveAccessToken(caller);
  const url = isNative
    ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`
    : `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`DRIVE_API_${res.status}: ${text.slice(0, 300)}`);
  }

  return {
    name: isNative && !meta.name?.toLowerCase().endsWith(".pdf") ? `${meta.name ?? "documento"}.pdf` : (meta.name ?? "archivo"),
    mimeType: isNative ? "application/pdf" : mimeType,
    body: res.body,
  };
}

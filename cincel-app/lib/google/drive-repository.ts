import "server-only";

import { getDriveClient } from "@/lib/google/client";
import { driveWebViewLink } from "@/lib/google/drive-url";

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

async function driveFetch<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const client = getDriveClient();
  if (!client) throw new Error("DRIVE_NOT_CONFIGURED");

  const { token } = await client.getAccessToken();
  if (!token) throw new Error("DRIVE_AUTH_FAILED");

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

/** Immediate children of `folderId`, folders first then files, name-sorted. */
export async function listFolder(
  folderId: string,
  pageToken?: string
): Promise<DriveListing> {
  const data = await driveFetch<{ files?: RawFile[]; nextPageToken?: string }>(
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

export async function getFileMeta(fileId: string): Promise<DriveEntry> {
  const raw = await driveFetch<RawFile>(
    `/files/${encodeURIComponent(fileId)}`,
    { fields: FILE_FIELDS }
  );
  return normalize(raw);
}

/** Full-text search, optionally scoped to a folder. */
export async function searchFiles(
  query: string,
  folderId?: string
): Promise<DriveEntry[]> {
  const escaped = query.replace(/['\\]/g, "\\$&");
  const clauses = [`name contains '${escaped}'`, "trashed = false"];
  if (folderId) clauses.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);

  const data = await driveFetch<{ files?: RawFile[] }>("/files", {
    q: clauses.join(" and "),
    fields: `files(${FILE_FIELDS})`,
    orderBy: "folder,name",
    pageSize: "100",
  });
  return (data.files ?? []).map(normalize);
}

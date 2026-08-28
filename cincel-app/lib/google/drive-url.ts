/**
 * Google Drive URL helpers — ID extraction and preview/embed URLs.
 *
 * Shared by the Recursos workspace, the project ficha page, and the Drive
 * picker. Pure string logic, no network.
 */
export type DriveLinkKind = "drive_folder" | "drive_file" | "web";

export function normalizeDriveUrl(url: string): string {
  return url.trim();
}

export function hasDriveUrl(url: string): boolean {
  return normalizeDriveUrl(url).length > 0;
}

/** Extract the Drive file/folder id from any Drive/Docs URL, or `null`. */
export function getDriveId(url: string): string | null {
  const clean = normalizeDriveUrl(url);
  if (!clean) return null;

  const docsMatch = clean.match(
    /docs\.google\.com\/(?:document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (docsMatch?.[1]) return docsMatch[1];

  const folderMatch = clean.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];

  const fileMatch = clean.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  const queryMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch?.[1]) return queryMatch[1];

  return null;
}

/** Embeddable preview URL for an iframe, or `null` when it can't be derived. */
export function getDrivePreviewUrl(
  url: string,
  linkType: DriveLinkKind
): string | null {
  const clean = normalizeDriveUrl(url);
  if (!clean) return null;

  const docsPreviewMatch = clean.match(
    /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (docsPreviewMatch) {
    const [, docType, docId] = docsPreviewMatch;
    return `https://docs.google.com/${docType}/d/${docId}/preview`;
  }

  const driveId = getDriveId(url);
  if (!driveId) return null;

  const isFolderUrl = /\/folders\//.test(clean);
  if (linkType === "drive_folder" || isFolderUrl) {
    return `https://drive.google.com/embeddedfolderview?id=${driveId}#grid`;
  }

  return `https://drive.google.com/file/d/${driveId}/preview`;
}

/** Best-guess link kind from a pasted URL. */
export function inferLinkTypeFromUrl(
  url: string,
  currentType: DriveLinkKind
): DriveLinkKind {
  const clean = normalizeDriveUrl(url);
  if (!clean) return currentType;
  if (/\/folders\//.test(clean)) return "drive_folder";
  if (/docs\.google\.com\//.test(clean)) return "drive_file";
  if (/drive\.google\.com\//.test(clean)) return "drive_file";
  return "web";
}

/** Canonical "open in Drive" link for a file/folder id. */
export function driveWebViewLink(id: string, isFolder: boolean): string {
  return isFolder
    ? `https://drive.google.com/drive/folders/${id}`
    : `https://drive.google.com/file/d/${id}/view`;
}

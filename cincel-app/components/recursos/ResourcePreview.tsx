"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/shadcn/sheet";
import DriveBrowser, { type DriveBrowserEntry } from "@/components/recursos/DriveBrowser";
import { resolveResourcePreview } from "@/components/recursos/resources-model";
import { canPreviewInline, driveContentUrl } from "@/lib/google/drive-url";
import type { ResourceLink } from "@/lib/types/resource";

/**
 * The resource viewer of the Recursos workspace (redesign FE §4.11.1): a Drive
 * folder opens in the Drive browser, a Drive file streams through the app as
 * the caller's account (download-only when it can't render inline), any other
 * Drive/Docs link embeds its preview. Shared by `ResourcesWorkspace` and the
 * Biblioteca (`DocumentReader`, the sección preview sheet).
 */
export function ResourcePreview({
  link,
  driveEnabled,
  title,
  unavailableReason,
  onDriveFileClick,
  heightClass = "h-[620px]",
}: {
  link: ResourceLink | null;
  driveEnabled: boolean;
  /** iframe title when the link has none. */
  title: string;
  /** Shown when there is nothing to preview. */
  unavailableReason: string | null;
  onDriveFileClick(entry: DriveBrowserEntry): void;
  heightClass?: string;
}) {
  const { previewUrl, driveFileId } = resolveResourcePreview(link, driveEnabled);

  if (driveFileId && link?.linkType === "drive_folder") {
    return (
      <div className={`flex ${heightClass} flex-col bg-card`}>
        <DriveBrowser active rootFolderId={driveFileId} onFileClick={onDriveFileClick} />
      </div>
    );
  }

  if (driveFileId) {
    return canPreviewInline(link?.drive?.mimeType) ? (
      <iframe title={link?.title ?? title} src={driveContentUrl(driveFileId)} className={`${heightClass} w-full`} />
    ) : (
      <div className={`flex ${heightClass} flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground`}>
        <p>Este tipo de archivo no tiene vista previa en la app.</p>
        <a href={driveContentUrl(driveFileId)} className="font-medium text-foreground underline">
          Descargar
        </a>
      </div>
    );
  }

  if (previewUrl) {
    return <iframe title={link?.title ?? title} src={previewUrl} className={`${heightClass} w-full`} />;
  }

  return (
    <div className={`flex ${heightClass} items-center justify-center p-8 text-center text-sm text-muted-foreground`}>
      {unavailableReason}
    </div>
  );
}

/** A file opened from a Drive browser, previewed in a right sheet. */
export function DriveFilePreviewSheet({
  entry,
  onClose,
}: {
  entry: DriveBrowserEntry | null;
  onClose(): void;
}) {
  return (
    <Sheet open={entry !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[90vw] max-w-5xl p-0" side="right">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <SheetTitle className="truncate">{entry?.name}</SheetTitle>
          {entry ? (
            <Button variant="outline" size="sm" onClick={() => window.open(entry.webViewLink, "_blank", "noopener")}>
              Abrir en Drive
            </Button>
          ) : null}
        </div>
        {entry ? (
          canPreviewInline(entry.mimeType) ? (
            <iframe title={entry.name} src={driveContentUrl(entry.id)} className="h-full w-full" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <p>Este tipo de archivo no tiene vista previa en la app.</p>
              <a href={driveContentUrl(entry.id)} className="font-medium text-foreground underline">
                Descargar
              </a>
            </div>
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

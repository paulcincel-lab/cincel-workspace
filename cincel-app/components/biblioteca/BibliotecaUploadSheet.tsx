"use client";

import { useState, type FormEvent } from "react";

import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { createResourceLinkAction } from "@/lib/actions/resources-actions";
import type { ResourcesCapabilities } from "@/lib/auth/permissions";
import { recurso } from "@/lib/biblioteca/catalog";
import { inferLinkTypeFromUrl } from "@/lib/google/drive-url";
import { useActionMutation } from "@/lib/query/mutation";
import { BIBLIOTECA_LINKS_PREFIX } from "@/lib/query/options/biblioteca";
import type { ResourceLink, ResourceLinkInput, ResourceSection } from "@/lib/types/resource";

/** The sections a document can be added to from the index, in menu order. */
const UPLOAD_SECTIONS: ResourceSection[] = ["mis-documentos", "plantillas-diseno", "formatos-obra", "formacion"];

export const DEFAULT_UPLOAD_SECTION: ResourceSection = "mis-documentos";

/** Whether the viewer may add resource links (the create action's own rule). */
export function canAddBibliotecaDocuments(capabilities: ResourcesCapabilities | null): boolean {
  if (!capabilities) return false;
  return (
    capabilities.enterprise.canCreate ||
    capabilities.enterprise.canEdit ||
    capabilities.enterprise.canDelete ||
    capabilities.corporate.canCreate ||
    capabilities.corporate.canDelete ||
    capabilities.canManageFavoritesSection
  );
}

function sectionOptions(capabilities: ResourcesCapabilities | null): ResourceSection[] {
  return capabilities?.enterprise.canCreate ? [...UPLOAD_SECTIONS, "empresa"] : UPLOAD_SECTIONS;
}

function sectionTitle(section: ResourceSection): string {
  return section === "empresa" ? "La empresa" : (recurso(section)?.title ?? section);
}

/** The create input of the form; Mis documentos is personal to the viewer. */
export function uploadInput(
  form: { section: ResourceSection; title: string; url: string; picked: DrivePickerEntry | null },
  viewerId: string | null,
): ResourceLinkInput {
  const url = form.url.trim();
  const picked = form.picked && form.picked.webViewLink === url ? form.picked : null;
  return {
    title: form.title.trim(),
    section: form.section,
    linkType: picked ? (picked.isFolder ? "drive_folder" : "drive_file") : inferLinkTypeFromUrl(url, "web"),
    url,
    ownerId: viewerId,
    personalForId: form.section === "mis-documentos" ? viewerId : null,
    drive: picked
      ? {
          googleFileId: picked.id,
          fileName: picked.name,
          mimeType: picked.mimeType,
          iconLink: picked.iconLink,
          thumbnailLink: picked.thumbnailLink,
          webViewLink: picked.webViewLink,
          sizeBytes: picked.sizeBytes ?? null,
          syncedAt: new Date().toISOString(),
        }
      : null,
  };
}

export type BibliotecaUploadSheetProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  capabilities: ResourcesCapabilities | null;
  viewerId: string | null;
  driveEnabled: boolean;
};

/**
 * "Subir documento" of the `/biblioteca` index: the resource add flow
 * (`createResourceLinkAction`, a Drive URL or the Drive picker) in a sheet,
 * with the section to file it in (default Mis documentos). Every Biblioteca
 * screen refetches its links afterwards.
 */
export function BibliotecaUploadSheet({ open, onOpenChange, capabilities, viewerId, driveEnabled }: BibliotecaUploadSheetProps) {
  const [section, setSection] = useState<ResourceSection>(DEFAULT_UPLOAD_SECTION);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<DrivePickerEntry | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSection(DEFAULT_UPLOAD_SECTION);
    setTitle("");
    setUrl("");
    setPicked(null);
    setError(null);
  };

  const create = useActionMutation<ResourceLinkInput, ResourceLink>(createResourceLinkAction, {
    invalidate: [BIBLIOTECA_LINKS_PREFIX],
    successToast: "Documento agregado",
    onFormError: setError,
    setData: () => {
      reset();
      onOpenChange(false);
    },
  });

  const options = sectionOptions(capabilities);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !url.trim()) {
      setError("Escribe un nombre y el enlace del documento.");
      return;
    }
    setError(null);
    create.mutate(uploadInput({ section, title, url, picked }, viewerId));
  };

  const pick = (entry: DrivePickerEntry) => {
    setPicked(entry);
    setUrl(entry.webViewLink);
    if (!title.trim()) setTitle(entry.name);
    setPickerOpen(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <SheetContent side="right" className="w-full max-w-md gap-0 p-0">
          <form onSubmit={submit} className="flex h-full flex-col">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle>Subir documento</SheetTitle>
              <SheetDescription>Agrega un archivo o una carpeta de Google Drive a la biblioteca.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="biblioteca-upload-section">Sección</Label>
                <Select
                  items={Object.fromEntries(options.map((key) => [key, sectionTitle(key)]))}
                  value={section}
                  onValueChange={(value) => {
                    if (typeof value === "string" && options.includes(value as ResourceSection)) setSection(value as ResourceSection);
                  }}
                >
                  <SelectTrigger id="biblioteca-upload-section" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((key) => (
                      <SelectItem key={key} value={key}>
                        {sectionTitle(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="biblioteca-upload-title">Nombre</Label>
                <Input id="biblioteca-upload-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="biblioteca-upload-url">Enlace de Google Drive</Label>
                <Input
                  id="biblioteca-upload-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://drive.google.com/…"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
                {driveEnabled ? (
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setPickerOpen(true)}>
                    Elegir de Google Drive
                  </Button>
                ) : null}
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Guardando…" : "Agregar"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {driveEnabled ? <DrivePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pick} /> : null}
    </>
  );
}

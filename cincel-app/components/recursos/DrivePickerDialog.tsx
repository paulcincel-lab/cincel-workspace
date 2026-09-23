"use client";

import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import DriveBrowser, { type DriveBrowserEntry } from "@/components/recursos/DriveBrowser";

export type DrivePickerEntry = DriveBrowserEntry;

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (entry: DrivePickerEntry) => void;
  /** Starting folder; when omitted the server's GOOGLE_DRIVE_ROOT_FOLDER_ID is used. */
  rootFolderId?: string;
};

export default function DrivePickerDialog({ open, onClose, onPick, rootFolderId }: Props) {
  const [selected, setSelected] = useState<DrivePickerEntry | null>(null);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[720px] max-w-[720px]" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border p-4">
          <SheetTitle className="text-base font-semibold">Elegir de Google Drive</SheetTitle>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </SheetHeader>

        <DriveBrowser
          active={open}
          rootFolderId={rootFolderId}
          selectedId={selected?.id ?? null}
          onFileClick={setSelected}
          onFileDoubleClick={onPick}
          onNavigate={() => setSelected(null)}
        />

        <SheetFooter className="mt-0 flex-row items-center justify-between border-t border-border p-4">
          <span className="truncate text-sm text-muted-foreground">
            {selected ? `Seleccionado: ${selected.name}` : "Selecciona un archivo"}
          </span>
          <Button disabled={!selected} onClick={() => selected && onPick(selected)}>
            Usar este archivo
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

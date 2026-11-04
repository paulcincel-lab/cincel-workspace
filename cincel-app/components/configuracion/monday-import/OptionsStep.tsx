"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { setOptions } from "@/lib/monday-import/wizard-steps";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayImportOptionsInfo } from "@/lib/types/monday-import";

/** Paso 5: bitácora and files; a switch is disabled, with its reason, when that can't be imported. */
export function OptionsStep({
  mapping,
  info,
  error,
  onMappingChange,
}: {
  mapping: MappingInput;
  info: MondayImportOptionsInfo | null;
  error: string;
  onMappingChange: (mapping: MappingInput) => void;
}) {
  const disabled = { updates: Boolean(info?.updatesDisabledReason), files: Boolean(info?.filesDisabledReason) };
  const current = {
    includeUpdates: !disabled.updates && mapping.options.includeUpdates !== false,
    includeFiles: !disabled.files && mapping.options.includeFiles !== false,
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label className="flex items-center gap-2">
          <Switch
            checked={current.includeUpdates}
            disabled={!info || disabled.updates}
            aria-describedby="monday-option-updates"
            onCheckedChange={(checked) => onMappingChange(setOptions(mapping, { ...current, includeUpdates: checked }, disabled))}
          />
          Incluir bitácora
        </Label>
        <p id="monday-option-updates" className="text-sm text-muted-foreground">
          {info?.updatesDisabledReason ?? "Las actualizaciones de monday serán comentarios en las tareas."}
        </p>
      </div>
      <div className="space-y-1">
        <Label className="flex items-center gap-2">
          <Switch
            checked={current.includeFiles}
            disabled={!info || disabled.files}
            aria-describedby="monday-option-files"
            onCheckedChange={(checked) => onMappingChange(setOptions(mapping, { ...current, includeFiles: checked }, disabled))}
          />
          Incluir archivos
        </Label>
        <p id="monday-option-files" className="text-sm text-muted-foreground">
          {info?.filesDisabledReason ?? "Los archivos se suben a la carpeta de Drive de cada proyecto."}
        </p>
      </div>
    </div>
  );
}

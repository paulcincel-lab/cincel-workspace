"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Textarea } from "@/components/ui/shadcn/textarea";
import type { ImportDiffSummary, LegacyStateApplyResult } from "@/lib/types/schedule";

import { useScheduleImportMutations } from "./schedule-mutations";

interface ImportDialogProps {
  projectId: string;
  scheduleId: string | null;
}

/**
 * Excel/CSV import (preview, then commit) and the legacy JSON apply. The
 * preview is a read with no invalidation; a commit or an apply invalidates the
 * schedule, Resumen, the project list and the project header, so the tab
 * shows the new schedule without a reload.
 */
export function ImportDialog({ projectId, scheduleId }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportDiffSummary | null>(null);
  const [excelError, setExcelError] = useState("");

  const [legacyJson, setLegacyJson] = useState("");
  const [legacyResult, setLegacyResult] = useState<LegacyStateApplyResult | null>(null);
  const [legacyError, setLegacyError] = useState("");

  const mutations = useScheduleImportMutations(projectId, { excel: setExcelError, legacy: setLegacyError });

  function resetExcelState() {
    setPreview(null);
    setExcelError("");
  }

  function handlePreview() {
    const file = selectedFile;
    if (!file) {
      setExcelError("Selecciona un archivo Excel o CSV.");
      return;
    }
    setExcelError("");
    const formData = new FormData();
    formData.set("file", file);
    mutations.preview.mutate(formData, {
      onSuccess: (summary) => setPreview(summary),
      onError: () => setPreview(null),
    });
  }

  function handleConfirm() {
    const file = selectedFile;
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setExcelError("");
    mutations.commit.mutate(formData, {
      onSuccess: () => {
        resetExcelState();
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setOpen(false);
      },
    });
  }

  function handleApplyLegacy() {
    if (!scheduleId) return;
    setLegacyError("");
    setLegacyResult(null);
    mutations.applyLegacy.mutate({ scheduleId, rawJson: legacyJson }, { onSuccess: (result) => setLegacyResult(result) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetExcelState();
      }}
    >
      <DialogTrigger render={<Button variant="outline">Importar</Button>} />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar cronograma</DialogTitle>
          <DialogDescription>Sube el Excel/CSV del cronograma o aplica un respaldo exportado del panel anterior.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="excel">
          <TabsList>
            <TabsTrigger value="excel">Excel / CSV</TabsTrigger>
            <TabsTrigger value="legacy">Respaldo JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="excel" className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  resetExcelState();
                }}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Columnas esperadas: ID, Planta, Partida/Sección, Responsable, Inicio, Fin, Tarea. Máximo 5 MB.
              </p>
            </div>

            {excelError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {excelError}
              </p>
            ) : null}

            {preview ? (
              <div className="rounded-xl border border-border p-3 text-sm">
                <p className="font-medium text-foreground">
                  {preview.keptCount} conservadas · {preview.newCount} nuevas · {preview.removedCount} eliminadas
                </p>
                {preview.removedTasks.length > 0 ? (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-muted p-2">
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tareas que se eliminarán</p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {preview.removedTasks.map((t) => (
                        <li key={t.stableKey}>{t.tarea}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              {preview ? (
                <Button onClick={handleConfirm} disabled={mutations.commit.isPending}>
                  Confirmar importación
                </Button>
              ) : (
                <Button onClick={handlePreview} disabled={mutations.preview.isPending}>
                  Vista previa
                </Button>
              )}
            </DialogFooter>
          </TabsContent>

          <TabsContent value="legacy" className="space-y-4">
            {!scheduleId ? (
              <p className="text-sm text-muted-foreground">
                Este proyecto todavía no tiene un cronograma importado — importa primero el Excel/CSV.
              </p>
            ) : (
              <>
                <Textarea
                  value={legacyJson}
                  onChange={(e) => setLegacyJson(e.target.value)}
                  placeholder='{"done": {...}, "flags": {...}, "imprevistos": [...]}'
                  rows={8}
                  className="font-mono text-xs"
                />
                {legacyError ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {legacyError}
                  </p>
                ) : null}
                {legacyResult ? (
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-medium text-foreground">{legacyResult.matchedCount} tareas actualizadas</p>
                    {legacyResult.unmatchedKeys.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {legacyResult.unmatchedKeys.length} claves sin coincidencia: {legacyResult.unmatchedKeys.slice(0, 10).join(", ")}
                        {legacyResult.unmatchedKeys.length > 10 ? "…" : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <DialogFooter>
                  <Button onClick={handleApplyLegacy} disabled={mutations.applyLegacy.isPending || !legacyJson.trim()}>
                    Aplicar
                  </Button>
                </DialogFooter>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

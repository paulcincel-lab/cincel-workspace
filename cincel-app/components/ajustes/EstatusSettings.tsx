"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { useTaskStatusesEditor } from "@/components/configuracion/useTaskStatusesEditor";
import { FormDialog } from "@/components/patterns/FormDialog";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  customStatusBase,
} from "@/lib/tasks/status-options";
import type { TaskStatus, TaskStatusOption } from "@/lib/types/core";

/**
 * Bases a custom status can sit under, with the value of "Cierra la tarea" a
 * new status starts with there (`customStatusBase`: closing → Completado,
 * open → En proceso).
 */
const CUSTOM_BASE_CLOSES: Partial<Record<TaskStatus, boolean>> = {
  en_proceso: false,
  completado: true,
};

function statusSummary(status: TaskStatusOption): string {
  const closes = status.closes ? "Cierra la tarea" : "No cierra la tarea";
  const counts = status.countsAsCompleted ? "cuenta como completada" : "no cuenta como completada";
  return `${closes} · ${counts}`;
}

/**
 * Ajustes › Estatus (redesign FE §3.8, frame `AjustesEstatus`): the custom
 * task statuses grouped under the base status whose color they take, on
 * `SettingsSection` / `SettingsRow`. Reads `qk.ajustes.page('estatus')`,
 * hydrated by the page, through `useTaskStatusesEditor`.
 */
export function EstatusSettings() {
  const {
    statuses,
    capabilities,
    showEditor,
    setShowEditor,
    editing,
    name,
    setName,
    closes,
    changeCloses,
    countsAsCompleted,
    setCountsAsCompleted,
    formError,
    isSaving,
    openEditor,
    save,
    remove,
  } = useTaskStatusesEditor();
  const [pendingDelete, setPendingDelete] = useState<TaskStatusOption | null>(null);
  const canManage = capabilities.canManageTaskStatuses;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Estatus</h2>
          <Badge variant="secondary">Admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Los estatus base no cambian. Los personalizados toman el color de su base y cada uno tiene su columna en
          el Tablero.
        </p>
      </div>

      {BASE_STATUSES.map((base) => {
        const customs = statuses.filter((status) => customStatusBase(status) === base);
        const acceptsCustom = base in CUSTOM_BASE_CLOSES;
        const baseLabel = BASE_STATUS_LABEL[base];
        return (
          <SettingsSection
            key={base}
            title={baseLabel}
            description={
              acceptsCustom
                ? "Estatus base · color fijo"
                : "Estatus base · color fijo. Los estatus personalizados van en En proceso o Completado."
            }
            actions={
              canManage && acceptsCustom ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(null, { closes: CUSTOM_BASE_CLOSES[base] })}
                >
                  <PlusIcon aria-hidden="true" />
                  Agregar estatus en {baseLabel}
                </Button>
              ) : undefined
            }
          >
            <SettingsRow
              label={baseLabel}
              description="Estatus base"
              control={<StatusBadge label={baseLabel} token={BASE_STATUS_COLOR[base]} />}
            />
            {customs.map((status) => (
              <SettingsRow
                key={status.id}
                label={status.name}
                description={statusSummary(status)}
                control={
                  <div className="flex items-center gap-2">
                    <StatusBadge label={status.name} token={BASE_STATUS_COLOR[base]} />
                    {canManage ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${status.name}`}
                          onClick={() => openEditor(status)}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Eliminar ${status.name}`}
                          onClick={() => setPendingDelete(status)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                }
              />
            ))}
            {acceptsCustom && customs.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Sin estatus personalizados.</p>
            ) : null}
          </SettingsSection>
        );
      })}

      <FormDialog
        title={editing ? "Editar estatus" : "Nuevo estatus"}
        open={showEditor}
        onOpenChange={setShowEditor}
        onSubmit={async () => {
          await save();
        }}
        submitLabel="Guardar"
        pending={isSaving}
        error={formError || null}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ajustes-status-name">Nombre</Label>
            <Input id="ajustes-status-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Checkbox
              id="ajustes-status-closes"
              checked={closes}
              onCheckedChange={(checked) => changeCloses(Boolean(checked))}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="ajustes-status-closes">Cierra la tarea</Label>
              <span className="text-muted-foreground">Las tareas en este estatus se cierran y dejan de vencer.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Switch
              id="ajustes-status-counts-as-completed"
              checked={countsAsCompleted}
              disabled={!closes}
              onCheckedChange={(checked) => setCountsAsCompleted(Boolean(checked))}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="ajustes-status-counts-as-completed">Cuenta como completada</Label>
              <span className="text-muted-foreground">
                Apágalo para estatus como Cancelado: cierran la tarea pero no cuentan como trabajo terminado.
              </span>
            </div>
          </div>
        </div>
      </FormDialog>

      <FormDialog
        title={pendingDelete ? `¿Eliminar el estatus "${pendingDelete.name}"?` : "Eliminar estatus"}
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onSubmit={async () => {
          if (!pendingDelete) return;
          await remove(pendingDelete);
          setPendingDelete(null);
        }}
        submitLabel="Eliminar"
      >
        <p className="text-sm text-muted-foreground">
          {pendingDelete
            ? `Las tareas que lo usan pasarán a "${pendingDelete.closes ? "Completado" : "En proceso"}".`
            : null}
        </p>
      </FormDialog>
    </div>
  );
}

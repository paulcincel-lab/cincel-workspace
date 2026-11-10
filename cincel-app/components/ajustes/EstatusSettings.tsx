"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { CatalogEditorPanel, CatalogLayout } from "@/components/ajustes/CatalogEditorPanel";
import {
  CatalogCreateButton,
  CatalogInlineAdd,
  CatalogListHeader,
  CatalogPanelFooter,
  CatalogRowMenu,
  catalogActionTrigger,
  isRecentlyCreated,
  MonoCount,
  NewPill,
  rowNewClass,
  useFlashedRows,
} from "@/components/ajustes/catalog-parts";
import { useTaskStatusesEditor } from "@/components/configuracion/useTaskStatusesEditor";
import { DataTable } from "@/components/ui/DataTable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Switch } from "@/components/ui/shadcn/switch";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  customStatusBase,
  statusDotClass,
  type StatusColorToken,
} from "@/lib/tasks/status-options";
import type { TaskStatus, TaskStatusOption } from "@/lib/types/core";
import { cn } from "@/lib/utils";

/** Color name of each base status token (`BASE_STATUS_COLOR`), as the list prints it. */
export const BASE_STATUS_COLOR_NAME: Record<TaskStatus, string> = {
  pendiente: "Ámbar",
  en_proceso: "Violeta",
  completado: "Azul",
  bloqueado: "Rojo · reservado",
};

/** Bases a custom status can sit under: "En proceso" ⇔ `closes = false`, "Completado" ⇔ `closes = true`. */
const CUSTOM_BASES = ["en_proceso", "completado"] as const;
type CustomBase = (typeof CUSTOM_BASES)[number];

export const ESTATUS_INLINE_PLACEHOLDER =
  "Escribe el nombre del estatus. Enter crea en En proceso; #completado para Completado";

const PREVIEW_TASK = "Planos de instalación eléctrica";
const FORM_ID = "ajustes-status-form";

function ColorDot({ token }: { token: StatusColorToken }) {
  return <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", statusDotClass(token))} />;
}

function tareas(n: number): string {
  return n === 1 ? "tarea" : "tareas";
}

function proyectos(n: number): string {
  return n === 1 ? "1 proyecto" : `${n} proyectos`;
}

/** The delete confirmation's description: where the status's tasks go. */
export function deleteStatusDescription(tasks: number): string {
  if (tasks === 0) return "Ninguna tarea lo usa.";
  if (tasks === 1) return "La tarea vuelve a su estatus base.";
  return `Las ${tasks} tareas vuelven a su estatus base.`;
}

type BaseRow = { status: TaskStatus; customs: number; tasks: number };
type Usage = { tasks: number; projects: number };
const NO_USAGE: Usage = { tasks: 0, projects: 0 };

/**
 * Ajustes › Estatus (frame `Ajustes-Estatus`): the four base statuses
 * (read-only) and the custom statuses as a reorderable list with an inline
 * add row, edited in the catalog side panel. Reads
 * `qk.ajustes.page('estatus')`, hydrated by the page, through
 * `useTaskStatusesEditor`. One layout for every presentation style.
 */
export function EstatusSettings() {
  const {
    statuses,
    baseCounts,
    customUsage,
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
    createQuick,
    reorder,
    isDeleting,
  } = useTaskStatusesEditor();
  const canManage = capabilities.canManageTaskStatuses;
  const [pendingDelete, setPendingDelete] = useState<TaskStatusOption | null>(null);
  const { flashed, flash } = useFlashedRows();
  const usageOf = (id: string): Usage => customUsage[id] ?? NO_USAGE;

  const customs = useMemo(
    () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es")),
    [statuses],
  );

  const baseRows = useMemo<BaseRow[]>(
    () =>
      BASE_STATUSES.map((status) => ({
        status,
        customs: statuses.filter((custom) => customStatusBase(custom) === status).length,
        tasks: baseCounts[status] ?? 0,
      })),
    [statuses, baseCounts],
  );

  const baseColumns = useMemo<ColumnDef<BaseRow, unknown>[]>(
    () => [
      {
        id: "estatus",
        header: "Estatus",
        cell: ({ row }) => (
          <StatusBadge label={BASE_STATUS_LABEL[row.original.status]} token={BASE_STATUS_COLOR[row.original.status]} />
        ),
      },
      {
        id: "color",
        header: "Color",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <ColorDot token={BASE_STATUS_COLOR[row.original.status]} />
            <span className="font-mono text-[13px]">{BASE_STATUS_COLOR_NAME[row.original.status]}</span>
          </span>
        ),
      },
      {
        id: "cierra",
        header: "Cierra la tarea",
        cell: ({ row }) => (row.original.status === "completado" ? "Sí" : "No"),
      },
      {
        id: "tareas",
        header: () => <span className="block text-right">Tareas</span>,
        cell: ({ row }) => <MonoCount>{row.original.tasks}</MonoCount>,
      },
      {
        id: "personalizados",
        header: () => <span className="block text-right">Personalizados</span>,
        cell: ({ row }) => <MonoCount>{row.original.customs > 0 ? row.original.customs : "—"}</MonoCount>,
      },
    ],
    [],
  );

  const customColumns = useMemo<ColumnDef<TaskStatusOption, unknown>[]>(() => {
    const columns: ColumnDef<TaskStatusOption, unknown>[] = [
      {
        id: "nombre",
        header: "Nombre",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-foreground">{row.original.name}</span>
            {isRecentlyCreated(row.original.createdAt) ? <NewPill /> : null}
          </span>
        ),
      },
      {
        id: "base",
        header: "Estatus base",
        cell: ({ row }) => {
          const base = customStatusBase(row.original);
          return <StatusBadge label={BASE_STATUS_LABEL[base]} token={BASE_STATUS_COLOR[base]} />;
        },
      },
      {
        id: "cierra",
        header: "Cierra la tarea",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.closes ? "Cierra la tarea" : "No cierra la tarea"}
          </span>
        ),
      },
      {
        id: "tareas",
        header: () => <span className="block text-right">Tareas</span>,
        cell: ({ row }) => <MonoCount>{(customUsage[row.original.id] ?? NO_USAGE).tasks}</MonoCount>,
      },
    ];
    if (canManage) {
      columns.push({
        id: "acciones",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <CatalogRowMenu
            name={row.original.name}
            actionId={row.original.id}
            actions={[
              { label: "Editar", onSelect: () => openEditor(row.original) },
              { label: "Eliminar", destructive: true, onSelect: () => setPendingDelete(row.original) },
            ]}
          />
        ),
      });
    }
    return columns;
    // `openEditor` is a fresh closure each render over the same state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, customUsage]);

  async function addInline(text: string) {
    const created = await createQuick(text);
    flash(created.id);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    if (await remove(pendingDelete)) setPendingDelete(null);
  }

  const base: CustomBase = closes ? "completado" : "en_proceso";
  const editingUsage = editing ? usageOf(editing.id) : NO_USAGE;
  const previewName = name.trim() || editing?.name || "Nuevo estatus";
  const pendingUsage = pendingDelete ? usageOf(pendingDelete.id) : NO_USAGE;

  const panel = (
    <CatalogEditorPanel
      title={editing ? "Editar estatus" : "Nuevo estatus"}
      open={showEditor}
      onClose={() => setShowEditor(false)}
      returnFocus={() => catalogActionTrigger(editing?.id)}
      footer={
        <CatalogPanelFooter
          onCancel={() => setShowEditor(false)}
          saveLabel={editing ? "Guardar cambios" : "Guardar"}
          saving={isSaving}
          canSave={canManage}
          formId={FORM_ID}
          error={formError || null}
          destructive={
            editing && canManage ? (
              <Button type="button" variant="destructive" onClick={() => setPendingDelete(editing)}>
                Eliminar estatus
              </Button>
            ) : null
          }
        />
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ajustes-status-name">Nombre</Label>
          <Input
            id="ajustes-status-name"
            value={name}
            disabled={!canManage}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Estatus base</legend>
          <RadioGroup
            value={base}
            disabled={!canManage}
            onValueChange={(value) => changeCloses(value === "completado")}
          >
            {CUSTOM_BASES.map((option) => {
              const id = `ajustes-status-base-${option}`;
              return (
                <div key={option} className="flex items-center gap-2">
                  <RadioGroupItem id={id} value={option} aria-label={BASE_STATUS_LABEL[option]} />
                  <Label htmlFor={id} className="inline-flex items-center gap-2 font-normal">
                    <ColorDot token={BASE_STATUS_COLOR[option]} />
                    {BASE_STATUS_LABEL[option]}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>

        {closes ? (
          <div className="flex items-start gap-3 text-sm">
            <Switch
              id="ajustes-status-counts-as-completed"
              checked={countsAsCompleted}
              disabled={!canManage}
              aria-label="Cuenta como completada"
              aria-describedby="ajustes-status-counts-hint"
              onCheckedChange={(checked) => setCountsAsCompleted(Boolean(checked))}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="ajustes-status-counts-as-completed">Cuenta como completada</Label>
              <span id="ajustes-status-counts-hint" className="text-[13px] text-muted-foreground">
                Las tareas en este estatus se cierran y dejan de vencer.
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">VISTA PREVIA</span>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-foreground">{PREVIEW_TASK}</span>
            <StatusBadge label={previewName} token={BASE_STATUS_COLOR[base]} />
          </div>
        </div>

        {editing ? (
          <p className="text-[13px] text-muted-foreground">
            {editingUsage.tasks > 0 ? (
              <>
                Usado en <strong className="font-semibold text-foreground">{editingUsage.tasks}</strong>{" "}
                {tareas(editingUsage.tasks)} de {proyectos(editingUsage.projects)}.
              </>
            ) : (
              "Sin tareas todavía."
            )}
          </p>
        ) : null}
      </form>
    </CatalogEditorPanel>
  );

  return (
    <div className="flex flex-col gap-4">
      <CatalogLayout panel={panel}>
        <section aria-labelledby="estatus-base" className="flex flex-col gap-3">
          <CatalogListHeader
            id="estatus-base"
            title="Estatus base"
            description="Estatus base · color fijo. Los estatus personalizados van en En proceso o Completado."
          />
          <DataTable columns={baseColumns} data={baseRows} getRowId={(row) => row.status} />
        </section>

        <section aria-labelledby="estatus-personalizados" className="flex flex-col gap-3">
          <CatalogListHeader
            id="estatus-personalizados"
            title="Estatus personalizados"
            count={customs.length}
            description="Cada uno toma el color de su estatus base. Arrastra para ordenar."
            action={canManage ? <CatalogCreateButton label="Nuevo estatus" onClick={() => openEditor(null)} /> : undefined}
          />
          <DataTable
            columns={customColumns}
            data={customs}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.name}
            reorderHeader="Orden"
            onReorderRows={canManage ? reorder : undefined}
            onRowClick={canManage ? (row) => openEditor(row) : undefined}
            rowClassName={(row) => rowNewClass(row.id, flashed)}
            emptyMessage="Aún no hay estatus personalizados."
          />
          {canManage ? (
            <CatalogInlineAdd
              label="Nuevo estatus personalizado"
              placeholder={ESTATUS_INLINE_PLACEHOLDER}
              onCreate={addInline}
              className="rounded-[10px] border border-dashed border-border"
            />
          ) : null}
        </section>
      </CatalogLayout>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete ? `¿Eliminar «${pendingDelete.name}»?` : "Eliminar estatus"}</AlertDialogTitle>
            <AlertDialogDescription>{deleteStatusDescription(pendingUsage.tasks)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={() => void confirmDelete()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

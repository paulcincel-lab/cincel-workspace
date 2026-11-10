"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { useMondayMutation } from "@/components/configuracion/monday-import/monday-mutations";
import { saveMondayStatusMapAction } from "@/lib/actions/monday-import-actions";
import { createTaskStatusAction } from "@/lib/actions/task-statuses-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import {
  STATUS_MAP_PRIORITY_LABELS,
  isMissingCustomStatus,
  setStatusMapEntry,
  statusMapRows,
  type StatusMapLabel,
  type StatusMapPriority,
  type StatusMapRow,
} from "@/lib/monday-import/status-map";
import { BASE_STATUS_LABELS, decodeStatusTarget, encodeStatusTarget } from "@/lib/monday-import/wizard-steps";
import { BASE_STATUS_COLOR, customStatusBase, statusDotClass } from "@/lib/tasks/status-options";
import type { TaskStatus, TaskStatusInput, TaskStatusOption } from "@/lib/types/core";
import type { StatusTarget } from "@/scripts/monday/mapping.schema";
import { cn } from "@/lib/utils";
import type { MondayImportChoices, MondayStatusMap } from "@/lib/types/monday-import";

/** Same cadence as the wizard's draft saves. */
export const STATUS_MAP_SAVE_DELAY_MS = 500;

const CREATE_STATUS = "__create__";
const NO_PRIORITY = "__none__";

const PRIORITY_CHOICES: Choice[] = [
  { value: NO_PRIORITY, label: "Sin cambio" },
  ...Object.entries(STATUS_MAP_PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
];

const SAVE_ERROR = "No se pudo guardar el mapa de estatus.";
const STATUS_NOT_FOUND_ERROR = "Uno de los estatus elegidos ya no existe. Elige otro y vuelve a guardar.";

export type CreatedStatus = { id: string; name: string; closes: boolean; countsAsCompleted: boolean };

type SaveState = "idle" | "saving" | "saved" | "error";

/** A new status shows on every screen that lists them (the Estatus list of Ajustes, #964). */
const STATUS_CREATED_KEYS = [
  qk.catalog.taskStatuses(),
  qk.ajustes.page("estatus"),
  qk.tareas.all,
  ["tasks"],
  qk.monday.choices(),
  qk.inicio(),
  qk.proyectos.list(),
] as const;

/** The base status a Cincel target reads as (its color and whether it closes the task). */
function targetBase(target: StatusTarget, statuses: MondayImportChoices["statuses"]): { base: TaskStatus; closes: boolean } {
  if ("customStatusId" in target) {
    const custom = statuses.find((status) => status.id === target.customStatusId);
    const closes = custom?.closes ?? false;
    return { base: customStatusBase({ closes }), closes };
  }
  return { base: target.status, closes: target.status === "completado" };
}

/** One monday label; "Crear estatus…" opens an inline form that creates it in Configuración → Estatus. */
function StatusMapRowView({
  row,
  statusChoices,
  statuses,
  invalid,
  onChange,
  onStatusCreated,
}: {
  row: StatusMapRow;
  statusChoices: Choice[];
  statuses: MondayImportChoices["statuses"];
  invalid: boolean;
  onChange: (row: StatusMapRow, patch: Partial<StatusMapRow["entry"]>) => void;
  onStatusCreated: (status: CreatedStatus) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(row.name);
  const [closes, setCloses] = useState(row.isDone);
  const [countsAsCompleted, setCountsAsCompleted] = useState(row.isDone);
  const [error, setError] = useState("");
  const createStatus = useActionMutation<TaskStatusInput, TaskStatusOption>(
    (input) => createTaskStatusAction(input),
    { invalidate: STATUS_CREATED_KEYS, onFormError: () => {} },
  );
  const isPending = createStatus.isPending;
  const errorId = `status-map-create-error-${row.key.replace(/\s+/g, "-")}`;

  function create() {
    setError("");
    if (!name.trim()) {
      setError("Escribe el nombre del estatus.");
      return;
    }
    void (async () => {
      try {
        const created = await createStatus.mutateAsync({
          name: name.trim(),
          closes,
          countsAsCompleted: closes && countsAsCompleted,
        });
        onStatusCreated({
          id: created.id,
          name: created.name,
          closes: created.closes,
          countsAsCompleted: created.countsAsCompleted,
        });
        onChange(row, { target: { customStatusId: created.id } });
        setCreating(false);
      } catch {
        setError("No se pudo crear el estatus. Revisa que el nombre no exista ya.");
      }
    })();
  }

  const { base, closes: targetCloses } = targetBase(row.entry.target, statuses);
  const suggested = !statuses.some((status) => status.name.trim().toLowerCase() === row.name.trim().toLowerCase());

  return (
    <TableRow>
      <TableCell className="align-top whitespace-normal">
        <span className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", statusDotClass(BASE_STATUS_COLOR[base]))} />
          <span className="text-foreground">{row.name}</span>
          {row.defaulted ? <Badge variant="outline">Sin equivalente</Badge> : null}
        </span>
      </TableCell>
      <TableCell className="text-right align-top font-mono tabular-nums">{row.items ?? "—"}</TableCell>
      <TableCell aria-hidden="true" className="align-top text-muted-foreground">
        →
      </TableCell>
      <TableCell className="min-w-[190px] space-y-2" aria-invalid={invalid ? true : undefined}>
        <ChoiceSelect
          label={`Estatus de Cincel para ${row.name}`}
          value={encodeStatusTarget(row.entry.target)}
          choices={[...statusChoices, { value: CREATE_STATUS, label: "Crear estatus…" }]}
          onChange={(next) => {
            if (next === CREATE_STATUS) {
              setCreating(true);
              return;
            }
            const target = decodeStatusTarget(next);
            if (target) onChange(row, { target });
          }}
        />
        {row.defaulted ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {suggested ? <span>Sugerido: «{row.name}»</span> : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Confirmar ${row.name} como ${BASE_STATUS_LABELS.pendiente}`}
              onClick={() => onChange(row, { target: row.entry.target })}
            >
              Dejar en {BASE_STATUS_LABELS.pendiente}
            </Button>
          </div>
        ) : null}
        {invalid ? <p className="text-sm text-destructive">Este estatus ya no existe. Elige otro.</p> : null}
        {creating ? (
          <div className="space-y-2">
            <Input
              aria-label="Nombre del estatus nuevo"
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${errorId}-closes`}
                  checked={closes}
                  onCheckedChange={(checked) => {
                    setCloses(checked === true);
                    if (checked !== true) setCountsAsCompleted(false);
                  }}
                />
                <Label htmlFor={`${errorId}-closes`}>Cierra la tarea</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${errorId}-counts`}
                  checked={closes && countsAsCompleted}
                  disabled={!closes}
                  onCheckedChange={(checked) => setCountsAsCompleted(checked === true)}
                />
                <Label htmlFor={`${errorId}-counts`}>Cuenta como completada</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={isPending} onClick={create}>
                {isPending ? "Creando…" : "Crear estatus"}
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
            {error ? (
              <Alert id={errorId} variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="align-top">{targetCloses ? "Sí" : "No"}</TableCell>
      <TableCell className="align-top">
        <ChoiceSelect
          label={`Prioridad para ${row.name}`}
          value={row.entry.priority ?? NO_PRIORITY}
          choices={PRIORITY_CHOICES}
          onChange={(next) => onChange(row, { priority: next === NO_PRIORITY ? null : (next as StatusMapPriority) })}
        />
      </TableCell>
    </TableRow>
  );
}

/**
 * The firm-wide monday status map (FE §4.6 item 5): one row per monday label with its Cincel status and priority.
 * Optimistic: each change is saved with `saveMondayStatusMapAction`, debounced, and the local value is kept when
 * the save fails. A save writes the map into `monday.choices` and refetches it.
 */
export function StatusMapTable({
  labels,
  choices,
  note,
  onStatusCreated,
  onSaved,
}: {
  labels: StatusMapLabel[];
  /** `statuses` for the selects and `statusMap`, the saved setting the table starts from. */
  choices: Pick<MondayImportChoices, "statuses" | "statusMap">;
  /** Shown above the table (the board sheet's "Cambiarlo aquí lo cambia para todos…"). */
  note?: string;
  onStatusCreated: (status: CreatedStatus) => void;
  /** The map the server saved, so other views start from it. */
  onSaved?: (map: MondayStatusMap) => void;
}) {
  const [map, setMap] = useState<MondayStatusMap>(() => choices.statusMap ?? {});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<MondayStatusMap | null>(null);
  const sequence = useRef(0);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);
  const saveMap = useMondayMutation((next: MondayStatusMap) => saveMondayStatusMapAction(next), {
    setData: (qc, result) =>
      qc.setQueryData<MondayImportChoices>(qk.monday.choices(), (current) =>
        current ? { ...current, statusMap: result.statusMap } : current,
      ),
    invalidate: [qk.monday.choices()],
  });
  // The unmount flush below runs after the component is gone: it keeps the latest `mutate`.
  const flushRef = useRef(saveMap.mutate);
  useEffect(() => {
    flushRef.current = saveMap.mutate;
  }, [saveMap.mutate]);

  const rows = statusMapRows(labels, map, choices.statuses);
  const statusChoices: Choice[] = [
    ...Object.entries(BASE_STATUS_LABELS).map(([value, label]) => ({ value: `status:${value}`, label })),
    ...choices.statuses.map((status) => ({ value: `custom:${status.id}`, label: `${status.name} (personalizado)` })),
  ];

  async function save(next: MondayStatusMap) {
    const id = ++sequence.current;
    pending.current = null;
    setSaveState("saving");
    setError("");
    let saved: MondayStatusMap | null = null;
    let failure = "";
    try {
      saved = (await saveMap.mutateAsync(next)).statusMap;
    } catch (err) {
      failure = err instanceof Error ? err.message : "";
    }
    // A newer change is on its way: its answer decides what the line says.
    if (id !== sequence.current || pending.current) return;
    if (saved) {
      setSaveState("saved");
      setNotFound(false);
      onSavedRef.current?.(saved);
      return;
    }
    setSaveState("error");
    setNotFound(failure === "STATUS_NOT_FOUND");
    setError(failure === "STATUS_NOT_FOUND" ? STATUS_NOT_FOUND_ERROR : SAVE_ERROR);
  }

  function schedule(next: MondayStatusMap) {
    pending.current = next;
    setSaveState("saving");
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(next);
    }, STATUS_MAP_SAVE_DELAY_MS);
  }

  // A change still waiting when the table goes away (the sheet closes) is saved right away.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const next = pending.current;
      if (next) flushRef.current(next);
    },
    [],
  );

  function change(row: StatusMapRow, patch: Partial<StatusMapRow["entry"]>) {
    const next = setStatusMapEntry(map, row.key, { ...row.entry, ...patch });
    setMap(next);
    schedule(next);
  }

  if (labels.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay columnas de estatus en los tableros.</p>;
  }

  return (
    <div className="space-y-3">
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estatus de monday</TableHead>
            <TableHead className="text-right">Elementos</TableHead>
            <TableHead>a</TableHead>
            <TableHead>Estatus de Cincel</TableHead>
            <TableHead>Cierra la tarea</TableHead>
            <TableHead>Prioridad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <StatusMapRowView
              key={row.key}
              row={row}
              statusChoices={statusChoices}
              statuses={choices.statuses}
              invalid={notFound && isMissingCustomStatus(row.entry.target, choices.statuses)}
              onChange={change}
              onStatusCreated={onStatusCreated}
            />
          ))}
        </TableBody>
      </Table>
      {saveState === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void save(map)}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : ""}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { saveMondayStatusMapAction } from "@/lib/actions/monday-import-actions";
import { createTaskStatusAction } from "@/lib/actions/task-statuses-actions";
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

/** One monday label; "Crear estatus…" opens an inline form that creates it in Configuración → Estatus. */
function StatusMapRowView({
  row,
  statusChoices,
  invalid,
  onChange,
  onStatusCreated,
}: {
  row: StatusMapRow;
  statusChoices: Choice[];
  invalid: boolean;
  onChange: (row: StatusMapRow, patch: Partial<StatusMapRow["entry"]>) => void;
  onStatusCreated: (status: CreatedStatus) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(row.name);
  const [closes, setCloses] = useState(row.isDone);
  const [countsAsCompleted, setCountsAsCompleted] = useState(row.isDone);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const errorId = `status-map-create-error-${row.key.replace(/\s+/g, "-")}`;

  function create() {
    setError("");
    if (!name.trim()) {
      setError("Escribe el nombre del estatus.");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createTaskStatusAction({
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
    });
  }

  return (
    <TableRow>
      <TableCell className="align-top whitespace-normal">
        <span className="text-foreground">{row.name}</span>
        {row.defaulted ? (
          <Badge variant="outline" className="ml-2">
            Sin equivalente
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="align-top tabular-nums">{row.items ?? "—"}</TableCell>
      <TableCell className="space-y-2" aria-invalid={invalid ? true : undefined}>
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
 * the save fails.
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
    let result: Awaited<ReturnType<typeof saveMondayStatusMapAction>>;
    try {
      result = await saveMondayStatusMapAction(next);
    } catch {
      result = { ok: false, error: SAVE_ERROR };
    }
    // A newer change is on its way: its answer decides what the line says.
    if (id !== sequence.current || pending.current) return;
    if (result.ok) {
      setSaveState("saved");
      setNotFound(false);
      onSavedRef.current?.(result.statusMap);
      return;
    }
    setSaveState("error");
    setNotFound(result.error === "STATUS_NOT_FOUND");
    setError(result.error === "STATUS_NOT_FOUND" ? STATUS_NOT_FOUND_ERROR : SAVE_ERROR);
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
      if (next) void saveMondayStatusMapAction(next).catch(() => undefined);
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
            <TableHead>Etiqueta</TableHead>
            <TableHead>Elementos</TableHead>
            <TableHead>Estatus de Cincel</TableHead>
            <TableHead>Prioridad</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <StatusMapRowView
              key={row.key}
              row={row}
              statusChoices={statusChoices}
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

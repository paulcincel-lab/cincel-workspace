"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import {
  CREATE_AREA,
  IGNORE,
  UNMAPPED,
  decodeTaskAreaChoice,
  decodeTaskAreaSource,
  encodeTaskAreaChoice,
  encodeTaskAreaSource,
  hasTaskAreas,
  setTaskAreaSource,
  setTaskAreaTarget,
  taskAreaColumns,
  taskAreaValues,
  unmappedTaskAreaValues,
  workflowsForArea,
} from "@/lib/monday-import/task-areas";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";
import type { TaskAreaTarget } from "@/scripts/monday/mapping.schema";

const NO_WORKFLOW = "__none__";

/**
 * "Área y workflow de las tareas" (#686): where the board's tasks take their área and workflow from, and the
 * Cincel área and workflow of each monday value. Self-contained, so it can move with the Equivalencias layout.
 */
export function TaskAreaWorkflowSection({
  board,
  source,
  choices,
  onBoardChange,
}: {
  board: BoardDraft;
  source: MondayBoardSource;
  choices: MondayImportChoices;
  onBoardChange: (update: (board: BoardDraft) => BoardDraft) => void;
}) {
  if (!hasTaskAreas(board)) return null;
  const id = `task-areas-${board.mondayBoardId}`;
  const columns = taskAreaColumns(board, source);
  const sourceChoices: Choice[] = [
    { value: "board", label: "El del tablero" },
    { value: "group", label: "Grupo de monday" },
    ...columns.map((column) => ({ value: `column:${column.id}`, label: `Columna «${column.title}»` })),
  ];
  const sourceValue = encodeTaskAreaSource(board.taskAreaSource);
  const values = taskAreaValues(board, source);
  const unmapped = unmappedTaskAreaValues(board, source);
  const areaChoices: Choice[] = [
    { value: UNMAPPED, label: "Sin equivalente" },
    ...choices.areas.map((area) => ({ value: area.id, label: area.name })),
    { value: CREATE_AREA, label: "Crear área" },
    { value: IGNORE, label: "Ignorar" },
  ];

  function workflowChoices(target: TaskAreaTarget): Choice[] {
    const offered = target.action === "area" ? workflowsForArea(target.areaId, choices) : choices.workflows;
    return [
      { value: NO_WORKFLOW, label: "Sin workflow" },
      ...offered.map((workflow) => ({ value: workflow.id, label: workflow.name })),
    ];
  }

  return (
    <section className="space-y-3" aria-labelledby={id}>
      <div className="space-y-1">
        <h3 id={id} className="text-sm font-medium text-foreground">
          Área y workflow de las tareas
        </h3>
        <p className="text-sm text-muted-foreground">
          De dónde toma cada tarea su área y su workflow. Con «El del tablero» todas usan el departamento y el
          workflow de arriba.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Tomar el área de</Label>
        <ChoiceSelect
          label="Tomar el área de"
          value={sourceValue}
          choices={sourceChoices}
          onChange={(value) =>
            onBoardChange((current) => setTaskAreaSource(current, decodeTaskAreaSource(value), source, choices))
          }
        />
      </div>

      {sourceValue !== "board" && values.length === 0 ? (
        <Alert>
          <AlertDescription>Esta columna no tiene valores en los elementos exportados.</AlertDescription>
        </Alert>
      ) : null}

      {values.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Valor de monday</TableHead>
              <TableHead className="w-1/3">Área de Cincel</TableHead>
              <TableHead className="w-1/3">Workflow</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {values.map(({ key, label }) => {
              const target = board.taskAreas?.[key];
              return (
                <TableRow key={key}>
                  <TableCell className="align-top">{label}</TableCell>
                  <TableCell className="space-y-2 align-top">
                    <ChoiceSelect
                      label={`Área para ${label}`}
                      value={encodeTaskAreaChoice(target)}
                      choices={areaChoices}
                      onChange={(value) =>
                        onBoardChange((current) =>
                          setTaskAreaTarget(
                            current,
                            key,
                            decodeTaskAreaChoice(value, label, current.taskAreas?.[key], choices),
                          ),
                        )
                      }
                    />
                    {target?.action === "create_area" ? (
                      <Input
                        aria-label={`Nombre del área nueva para ${label}`}
                        value={target.name}
                        aria-invalid={target.name.trim() ? undefined : true}
                        onChange={(event) =>
                          onBoardChange((current) =>
                            setTaskAreaTarget(current, key, { ...target, name: event.target.value }),
                          )
                        }
                      />
                    ) : null}
                    {target?.action === "create_area" && !target.name.trim() ? (
                      <Alert variant="destructive">
                        <AlertDescription>Escribe el nombre del área.</AlertDescription>
                      </Alert>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    {target && target.action !== "ignore" ? (
                      <ChoiceSelect
                        label={`Workflow para ${label}`}
                        value={target.workflowId ?? NO_WORKFLOW}
                        choices={workflowChoices(target)}
                        onChange={(value) =>
                          onBoardChange((current) =>
                            setTaskAreaTarget(current, key, {
                              ...target,
                              workflowId: value === NO_WORKFLOW ? null : value,
                            }),
                          )
                        }
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">El del tablero</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      {unmapped.length > 0 ? (
        <Alert>
          <AlertDescription>
            {unmapped.length === 1
              ? `«${unmapped[0]}» no tiene área; sus tareas quedan con el workflow del tablero.`
              : `${unmapped.length} valores no tienen área; sus tareas quedan con el workflow del tablero.`}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

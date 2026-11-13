"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import {
  applyGroupAsProject,
  currentGroupTarget,
  decodeGroupTarget,
  encodeGroupTarget,
  groupTargetChoices,
  setGroupTarget,
  suggestsGroupAsProject,
} from "@/lib/monday-import/group-targets";
import { decodeClient, encodeClient, type BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

/**
 * Groups of a board_as_project or item_as_project board: each one becomes one of the six targets (a etapa, a
 * fase, an espacio, a separate project, admin tasks or nothing), defaulting to `resolveGroupTarget`. Suggests
 * "Grupo como proyecto" for the whole board when its groups are named like clients. Also used by the remap.
 */
export function GroupTargetsTable({
  board,
  source,
  choices,
  clientChoices,
  onBoardChange,
}: {
  board: BoardDraft;
  source: MondayBoardSource;
  choices: MondayImportChoices;
  /** The board's client select options, for groups that become their own project. */
  clientChoices: Choice[];
  onBoardChange: (update: (board: BoardDraft) => BoardDraft) => void;
}) {
  const suggest = suggestsGroupAsProject(board, source, choices);
  const itemsByGroup = new Map<string, number>();
  for (const item of source.items) {
    if (item.groupId) itemsByGroup.set(item.groupId, (itemsByGroup.get(item.groupId) ?? 0) + 1);
  }
  /** "{Etapa} · {Fase}" of a fase target. */
  const phaseLabel = (phaseId: string): string | null => {
    for (const workflow of choices.workflows) {
      const phase = workflow.phases.find((candidate) => candidate.id === phaseId);
      if (phase) return `${workflow.name} · ${phase.name}`;
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {suggest ? (
        <Alert>
          <AlertTitle>Los grupos parecen clientes u obras</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Varios grupos se llaman como clientes del Directorio. Con «Grupo como proyecto» cada grupo será un
              proyecto con su cliente, en lugar de una etapa o una fase.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBoardChange((current) => applyGroupAsProject(current, source, choices))}
            >
              Usar «Grupo como proyecto»
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupo de monday</TableHead>
            <TableHead className="text-right">Elementos</TableHead>
            <TableHead>a</TableHead>
            <TableHead className="w-1/2">En Cincel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {source.groups.map((group) => {
            const target = currentGroupTarget(board, group, choices);
            return (
              <TableRow key={group.id}>
                <TableCell className="align-top">{group.title}</TableCell>
                <TableCell className="text-right align-top font-mono tabular-nums">
                  {itemsByGroup.get(group.id) ?? 0}
                </TableCell>
                <TableCell aria-hidden="true" className="align-top text-muted-foreground">
                  →
                </TableCell>
                <TableCell className="min-w-[190px] space-y-2 whitespace-normal">
                  <ChoiceSelect
                    label={`Equivalente de ${group.title}`}
                    value={encodeGroupTarget(target)}
                    choices={groupTargetChoices(board, group, choices)}
                    onChange={(value) => {
                      const next = decodeGroupTarget(value);
                      if (next) onBoardChange((current) => setGroupTarget(current, group.id, next));
                    }}
                  />
                  {target.kind === "project" ? (
                    <ChoiceSelect
                      label={`Cliente de ${group.title}`}
                      value={board.groupClients?.[group.id] ? encodeClient(board.groupClients[group.id]) : "none"}
                      choices={[
                        { value: "none", label: "El cliente del tablero" },
                        ...clientChoices.filter((choice) => choice.value !== "none"),
                      ]}
                      onChange={(value) =>
                        onBoardChange((current) => {
                          const groupClients = { ...(current.groupClients ?? {}) };
                          const client = decodeClient(value, group.title);
                          if (client) groupClients[group.id] = client;
                          else delete groupClients[group.id];
                          return { ...current, groupClients };
                        })
                      }
                    />
                  ) : null}
                  {target.kind === "phase" && phaseLabel(target.phaseId) ? (
                    <p className="text-sm text-foreground">{phaseLabel(target.phaseId)}</p>
                  ) : null}
                  {target.kind === "ignore" ? (
                    <>
                      <p className="text-sm font-medium text-foreground">No importar</p>
                      <p className="text-sm text-muted-foreground">Los elementos de este grupo no se importan.</p>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

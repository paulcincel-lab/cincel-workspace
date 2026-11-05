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
 * Groups of a board_as_project or item_as_project board (#687): each one becomes a phase of the board's
 * workflow, a new phase, a workflow stage, its own project or nothing. Suggests "Grupo como proyecto" for the
 * whole board when its groups are named like clients.
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

  return (
    <div className="space-y-3">
      {suggest ? (
        <Alert>
          <AlertTitle>Los grupos parecen clientes u obras</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Varios grupos se llaman como clientes del Directorio. Con «Grupo como proyecto» cada grupo será un
              proyecto con su cliente, en lugar de una fase.
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
            <TableHead className="w-1/2">Grupo de monday</TableHead>
            <TableHead className="w-1/2">En Cincel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {source.groups.map((group) => {
            const target = currentGroupTarget(board, group, choices);
            return (
              <TableRow key={group.id}>
                <TableCell className="align-top">{group.title}</TableCell>
                <TableCell className="space-y-2 whitespace-normal">
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
                  {target.kind === "ignore" ? (
                    <p className="text-sm text-muted-foreground">Los elementos de este grupo no se importan.</p>
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

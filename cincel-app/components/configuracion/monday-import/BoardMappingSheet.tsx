"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { BoardChipBadge, countsText } from "@/components/configuracion/monday-import/BoardGallery";
import { ChoiceSelect } from "@/components/configuracion/monday-import/ChoiceSelect";
import { BoardEquivalences } from "@/components/configuracion/monday-import/EquivalenciasStep";
import { PeopleStep } from "@/components/configuracion/monday-import/PeopleStep";
import type { BoardCard } from "@/lib/monday-import/board-cards";
import { STRATEGY_OPTIONS, findBoard, strategyDescription, updateBoard } from "@/lib/monday-import/wizard-steps";
import type { BoardStrategy, MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

const STRATEGY_CHOICES = STRATEGY_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

/**
 * An opened board card (#685): the board's whole mapping, monday on the left and Cincel on the right — strategy,
 * the Equivalencias sections (columns, statuses, groups, client, áreas and workflows, subitems, names and codes,
 * cronograma, templates) and the people of the board. Every change goes to the draft, so the card's chip updates live.
 */
export function BoardMappingSheet({
  card,
  mapping,
  source,
  choices,
  runId,
  disabled,
  onOpenChange,
  onMappingChange,
  onStatusCreated,
  onStaffCreated,
}: {
  /** null when closed. */
  card: BoardCard | null;
  mapping: MappingInput;
  source: MondayExportSource | null;
  choices: MondayImportChoices | null;
  runId: string | null;
  /** The import is applied or a job runs: the mapping is read-only. */
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onMappingChange: (mapping: MappingInput) => void;
  onStatusCreated: (status: { id: string; name: string; closes: boolean }) => void;
  onStaffCreated: (member: MondayImportChoices["staff"][number]) => void;
}) {
  const board = card ? findBoard(mapping, card.id) : undefined;
  const boardSource = source?.boards.find((candidate) => candidate.id === card?.id);
  const onBoard = new Set(boardSource?.userIds ?? []);
  // Older exports don't list the board's people: then every monday user shows.
  const peopleSource =
    source && boardSource?.userIds ? { ...source, users: source.users.filter((user) => onBoard.has(user.id)) } : source;

  return (
    <Sheet open={card !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={
          "w-full overflow-y-auto motion-reduce:transition-none data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
        }
      >
        {card ? (
          <>
            <SheetHeader className="gap-2 border-b pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{card.name}</SheetTitle>
                <BoardChipBadge chip={card.chip} />
              </div>
              <SheetDescription>
                {card.estimated ? "≈ " : null}
                {countsText(card.counts)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-8 px-4 pb-8">
              {!board || !boardSource || !choices ? (
                <p className="text-sm text-muted-foreground">Cargando el mapeo…</p>
              ) : (
                <>
                  {card.problems.length > 0 ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        <ul className="list-disc space-y-1 pl-4">
                          {card.problems.map((problem) => (
                            <li key={problem} className="break-words">
                              {problem}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <section className="space-y-2" aria-labelledby={`strategy-${card.id}`}>
                    <h3 id={`strategy-${card.id}`} className="text-sm font-medium text-foreground">
                      Qué será en Cincel
                    </h3>
                    <ChoiceSelect
                      label={`Estrategia de ${board.name}`}
                      value={board.strategy}
                      choices={STRATEGY_CHOICES}
                      disabled={disabled}
                      onChange={(value) =>
                        onMappingChange(
                          updateBoard(mapping, board.mondayBoardId, (current) => ({
                            ...current,
                            strategy: value as BoardStrategy,
                          })),
                        )
                      }
                    />
                    <p className="text-sm text-muted-foreground">{strategyDescription(board.strategy)}</p>
                  </section>
                  {/* Read-only while applied or running: the controls stay visible but don't take clicks. */}
                  <fieldset disabled={disabled} className="min-w-0 space-y-8">
                    <BoardEquivalences
                      key={board.mondayBoardId}
                      board={board}
                      source={boardSource}
                      choices={choices}
                      onStatusCreated={onStatusCreated}
                      onBoardChange={(update) => onMappingChange(updateBoard(mapping, board.mondayBoardId, update))}
                    />
                    {board.strategy !== "skip" && peopleSource ? (
                      <section className="space-y-3" aria-labelledby={`people-${card.id}`}>
                        <h3 id={`people-${card.id}`} className="text-sm font-medium text-foreground">
                          Personas del tablero
                        </h3>
                        <PeopleStep
                          mapping={mapping}
                          source={peopleSource}
                          choices={choices}
                          runId={runId}
                          onMappingChange={onMappingChange}
                          onStaffCreated={onStaffCreated}
                        />
                      </section>
                    ) : null}
                  </fieldset>
                </>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

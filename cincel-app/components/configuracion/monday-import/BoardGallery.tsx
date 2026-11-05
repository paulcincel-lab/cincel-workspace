"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { ChoiceSelect } from "@/components/configuracion/monday-import/ChoiceSelect";
import {
  cardWorkspaces,
  chipLabel,
  filterBoardCards,
  initials,
  selectBoards,
  toggleBoard,
  workspaceLabel,
  type BoardCard,
  type BoardChip,
  type BoardCounts,
} from "@/lib/monday-import/board-cards";
import { STRATEGY_OPTIONS, countLabel } from "@/lib/monday-import/wizard-steps";

const ALL_WORKSPACES = "__all__";
/** Cards fade and rise in, and lift on hover, only without prefers-reduced-motion. */
const CARD_MOTION =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:transition-shadow " +
  "motion-safe:duration-200 hover:shadow-md";
const MAX_AVATARS = 4;

/** «listo», «⚠ n» or «mapear»; keyed by its text so a change fades in (only without prefers-reduced-motion). */
export function BoardChipBadge({ chip }: { chip: BoardChip }) {
  const label = chipLabel(chip);
  const variant = chip.kind === "listo" ? "default" : chip.kind === "problemas" ? "destructive" : "outline";
  return (
    <Badge
      key={label}
      variant={variant}
      aria-label={chip.kind === "problemas" ? `${chip.count} por corregir` : label}
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
    >
      {chip.kind === "listo" ? <Check data-icon="inline-start" aria-hidden="true" /> : null}
      {label}
    </Badge>
  );
}

/** "3 proyectos · 40 tareas · 1 contacto · 2 avisos"; tasks are left out while only the Vista previa knows them. */
export function countsText(counts: BoardCounts): string {
  return [
    countLabel(counts.proyectos, "proyecto", "proyectos"),
    counts.tareas === null ? null : countLabel(counts.tareas, "tarea", "tareas"),
    countLabel(counts.contactos, "contacto", "contactos"),
    countLabel(counts.avisos, "aviso", "avisos"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function BoardPeople({ people }: { people: BoardCard["people"] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, MAX_AVATARS);
  const names = people.map((person) => person.name).join(", ");
  return (
    <AvatarGroup role="img" aria-label={`Personas: ${names}`} title={names}>
      {shown.map((person) => (
        <Avatar key={person.id} size="sm">
          <AvatarFallback>{initials(person.name)}</AvatarFallback>
        </Avatar>
      ))}
      {people.length > shown.length ? <AvatarGroupCount>+{people.length - shown.length}</AvatarGroupCount> : null}
    </AvatarGroup>
  );
}

/**
 * One board: the checkbox (or a click anywhere on the card) picks it, "Abrir mapeo" opens its mapping once exported.
 */
export function BoardCardView({
  card,
  selected,
  selectable,
  onSelectedChange,
  onOpen,
}: {
  card: BoardCard;
  selected: boolean;
  selectable: boolean;
  onSelectedChange: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const strategy = STRATEGY_OPTIONS.find((option) => option.value === card.strategy)?.label;
  const facts = [
    card.itemCount === null ? null : countLabel(card.itemCount, "elemento", "elementos"),
    card.groupCount === null ? null : countLabel(card.groupCount, "grupo", "grupos"),
  ].filter(Boolean);
  return (
    <li>
      <Card
        data-state={selected ? "selected" : undefined}
        role="group"
        aria-label={card.name}
        className={`h-full ${CARD_MOTION}${selectable ? " cursor-pointer" : ""}`}
        onClick={(event) => {
          // The checkbox and the buttons handle themselves; the rest of the card is a bigger target.
          if (!selectable || (event.target as HTMLElement).closest("button, input, a, [role=checkbox]")) return;
          onSelectedChange(!selected);
        }}
      >
        <CardHeader>
          <div className="flex min-w-0 items-start gap-3">
            {/* Base UI's checkbox root is a <span>: it needs a flex parent to keep its size-4 box. */}
            <div className="flex items-center pt-0.5">
              <Checkbox
                aria-label={`Importar ${card.name}`}
                checked={selected}
                disabled={!selectable}
                onCheckedChange={(checked) => onSelectedChange(checked === true)}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="break-words">{card.name}</CardTitle>
              <CardDescription>{workspaceLabel(card.workspaceId, card.workspaceName)}</CardDescription>
            </div>
          </div>
          <CardAction>
            <BoardChipBadge chip={card.chip} />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">{facts.length > 0 ? facts.join(" · ") : "Sin datos de monday"}</p>
            <BoardPeople people={card.people} />
          </div>
          {card.exported ? (
            <p className="text-foreground" aria-live="polite">
              {card.estimated ? "≈ " : null}
              {countsText(card.counts)}
            </p>
          ) : (
            <p className="text-muted-foreground">Exporta el tablero para mapearlo.</p>
          )}
          {card.problems.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-destructive">
              {card.problems.slice(0, 3).map((problem) => (
                <li key={problem} className="break-words">
                  {problem}
                </li>
              ))}
              {card.problems.length > 3 ? <li>Y {card.problems.length - 3} más.</li> : null}
            </ul>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t py-3">
          <span className="text-muted-foreground">{strategy ?? "Sin exportar"}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!card.exported}
            aria-label={`Abrir mapeo de ${card.name}`}
            onClick={onOpen}
          >
            Abrir mapeo
          </Button>
        </CardFooter>
      </Card>
    </li>
  );
}

/**
 * The board gallery (#685): search, workspace filter, "Seleccionar todos" / "Ninguno" (over the visible cards) and
 * one card per board. Nothing is preselected.
 */
export function BoardGallery({
  cards,
  selectedBoardIds,
  onSelectedChange,
  selectable,
  onOpen,
}: {
  cards: BoardCard[];
  selectedBoardIds: string[];
  onSelectedChange: (boardIds: string[]) => void;
  selectable: boolean;
  onOpen: (boardId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const workspaces = cardWorkspaces(cards);
  const visible = filterBoardCards(cards, query, workspaceId);
  const selected = new Set(selectedBoardIds);

  return (
    <section className="space-y-4" aria-labelledby="monday-boards-gallery">
      <h3 id="monday-boards-gallery" className="text-sm font-medium text-foreground">
        Tableros de monday
      </h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar tableros"
            placeholder="Buscar tablero"
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {workspaces.length > 1 ? (
          <div className="sm:w-60">
            <ChoiceSelect
              label="Espacio de trabajo"
              value={workspaceId || ALL_WORKSPACES}
              choices={[
                { value: ALL_WORKSPACES, label: "Todos los espacios" },
                ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
              ]}
              onChange={(value) => setWorkspaceId(value === ALL_WORKSPACES ? "" : value)}
            />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!selectable || visible.length === 0}
            onClick={() => onSelectedChange(selectBoards(selectedBoardIds, visible, true))}
          >
            Seleccionar todos
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectable || !visible.some((card) => selected.has(card.id))}
            onClick={() => onSelectedChange(selectBoards(selectedBoardIds, visible, false))}
          >
            Ninguno
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cards.length === 0 ? "No hay tableros." : "Ningún tablero coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Tableros">
          {visible.map((card) => (
            <BoardCardView
              key={card.id}
              card={card}
              selected={selected.has(card.id)}
              selectable={selectable}
              onSelectedChange={(checked) => onSelectedChange(toggleBoard(selectedBoardIds, card.id, checked))}
              onOpen={() => onOpen(card.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Footer bar of Tableros: "Seleccionados: n", the live totals and "Importar n tableros". */
export function SelectionBar({
  totals,
  exporting,
  disabled,
  onImport,
}: {
  totals: BoardCounts & { n: number };
  exporting: boolean;
  disabled: boolean;
  onImport: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
      <p className="text-sm text-foreground">
        Seleccionados: {totals.n}
        {totals.n > 0 ? <span className="text-muted-foreground"> · {countsText(totals)}</span> : null}
      </p>
      <Button disabled={disabled || totals.n === 0} onClick={onImport}>
        {exporting ? "Exportando…" : `Importar ${countLabel(totals.n, "tablero", "tableros")}`}
      </Button>
    </div>
  );
}

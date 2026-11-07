"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { createMondayStaffAction, suggestMondayPositionAction } from "@/lib/actions/monday-import-actions";
import type { MondayPositionSuggestion } from "@/lib/types/monday-import";
import type { CreatedStaff } from "@/scripts/monday/created-staff";

/** The "Puesto" select's value for no puesto (select values are never empty). */
const NO_POSITION = "none";

/** "Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo." or the no-suggestion line. */
export function suggestionReason(suggestion: MondayPositionSuggestion): string {
  const top = suggestion.topPhases[0];
  if (!suggestion.position || !top) return "Sin sugerencia: sus tareas no tienen fase.";
  return `Sugerido por sus tareas: ${top.tasks} de ${suggestion.tasks} en ${top.workflowName} · ${top.phaseName}.`;
}

/**
 * "Crear integrante" (#689, project flow §4.8): a two-step control. The button opens a popover with a "Puesto"
 * select, preselected with the puesto `suggestMondayPositionAction` suggests from where the person's tasks land,
 * and its reason underneath. "Crear integrante" there creates the staff member of the monday person (name and email
 * from monday, pending until their first Google sign-in) with that puesto and hands it back. Errors show inline.
 */
export function CreateStaffButton({
  runId,
  user,
  positions = [],
  onCreated,
}: {
  runId: string;
  user: { id: string; name: string };
  /** The puesto catalog (`choices.positions`). */
  positions?: { id: string; name: string }[];
  onCreated: (staff: CreatedStaff) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<MondayPositionSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [positionId, setPositionId] = useState(NO_POSITION);
  // Set once the person picks a puesto, so a late suggestion never overrides it.
  const picked = useRef(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadSuggestion() {
    setLoadingSuggestion(true);
    setSuggestionError("");
    try {
      const result = await suggestMondayPositionAction(runId, user.id);
      if (!result.ok) {
        setSuggestionError(result.error);
        return;
      }
      setSuggestion(result.suggestion);
      const suggested = result.suggestion.position?.id;
      if (suggested && !picked.current) setPositionId(suggested);
    } catch {
      setSuggestionError("No se pudo cargar la sugerencia de puesto.");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setError("");
      if (!suggestion && !loadingSuggestion) void loadSuggestion();
    }
  }

  function create() {
    setError("");
    startTransition(async () => {
      const positionIds = positionId === NO_POSITION ? [] : [positionId];
      const result = await createMondayStaffAction(runId, user.id, { positionIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onCreated(result.staff);
    });
  }

  // The suggested puesto is listed even if the catalog given here lacks it.
  const suggestedPosition = suggestion?.position ?? null;
  const catalog =
    suggestedPosition && !positions.some((position) => position.id === suggestedPosition.id)
      ? [...positions, suggestedPosition]
      : positions;
  const choices: Choice[] = [
    { value: NO_POSITION, label: "Sin puesto" },
    ...catalog.map((position) => ({ value: position.id, label: position.name })),
  ];

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" disabled={isPending} />}>
        Crear integrante
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 p-4">
        <p className="whitespace-normal text-sm font-medium text-foreground">{user.name}</p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Puesto</p>
          <ChoiceSelect
            label="Puesto"
            value={positionId}
            choices={choices}
            disabled={isPending}
            onChange={(next) => {
              picked.current = true;
              setPositionId(next);
            }}
          />
          {loadingSuggestion ? (
            <Skeleton className="h-4 w-full" data-testid="position-suggestion-loading" />
          ) : suggestionError ? (
            <p className="whitespace-normal text-xs text-muted-foreground">{suggestionError}</p>
          ) : suggestion ? (
            <p className="whitespace-normal text-xs text-muted-foreground">{suggestionReason(suggestion)}</p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="whitespace-normal text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={isPending} onClick={create}>
            {isPending ? "Creando integrante…" : "Crear integrante"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

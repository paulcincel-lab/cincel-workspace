"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { mondayErrorText, useMondayMutation } from "@/components/configuracion/monday-import/monday-mutations";
import { createMondayStaffAction } from "@/lib/actions/monday-import-actions";
import { qk } from "@/lib/query/keys";
import { mondayPositionSuggestionOptions } from "@/lib/query/options/monday";
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
 * select, preselected with the puesto `suggestMondayPositionAction` suggests from where the person's tasks land
 * (`monday.positionSuggestion`, read while the popover is open), and its reason underneath. "Crear integrante" there creates the staff member of the monday person (name and email
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
  // null until the person picks a puesto, so the suggestion preselects it and never overrides a pick.
  const [pickedPositionId, setPickedPositionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const suggestionQuery = useQuery({ ...mondayPositionSuggestionOptions(runId, user.id), enabled: open });
  const suggestion = suggestionQuery.data ?? null;
  const loadingSuggestion = open && suggestionQuery.isLoading;
  const suggestionError = suggestionQuery.error
    ? mondayErrorText(suggestionQuery.error, "No se pudo cargar la sugerencia de puesto.")
    : "";
  const positionId = pickedPositionId ?? suggestion?.position?.id ?? NO_POSITION;
  const createMutation = useMondayMutation(
    (positionIds: string[]) => createMondayStaffAction(runId, user.id, { positionIds }),
    { invalidate: [qk.catalog.staff(), qk.ajustes.page("puestos")] },
  );
  const isPending = createMutation.isPending;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) setError("");
  }

  async function create() {
    setError("");
    try {
      const result = await createMutation.mutateAsync(positionId === NO_POSITION ? [] : [positionId]);
      setOpen(false);
      onCreated(result.staff);
    } catch (err) {
      setError(mondayErrorText(err));
    }
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
            onChange={setPickedPositionId}
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
          <Button type="button" size="sm" disabled={isPending} onClick={() => void create()}>
            {isPending ? "Creando integrante…" : "Crear integrante"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

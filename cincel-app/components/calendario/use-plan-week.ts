"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  applyProposalAction,
  cancelProposalAction,
  runProposingToolAction,
  undoProposalAction,
} from "@/lib/actions/calendario-actions";
import { moveInputFor, planInputFor } from "@/components/widgets/calendario/plan-week-model";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { calendarioInvalidations, planWeekOptions, proposalOptions } from "@/lib/query/options/calendario";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { PlanWeekData, Proposal } from "@/lib/types/calendario";

/** Shown when "✦ Planear mi semana" finds no task to place. */
export const PLAN_NOTHING_TO_PLAN = "No hay tareas pendientes por planear esta semana.";

/**
 * Planear mi semana (FE §7.7): the plan data of the visible week and the
 * proposal flow. A drop, "Mover a…" and the keyboard all call `move`, a
 * one-row `move_tasks` proposal; "✦ Planear mi semana" calls `plan_week` with
 * the rows dropped in the drop zone. Nothing writes until Aplicar.
 */
export function usePlanWeek(weekStart: string): {
  data: PlanWeekData | undefined;
  proposal: Proposal | null;
  checked: string[];
  busy: boolean;
  canUndo: boolean;
  plan(): void;
  move(taskId: string, staffId: string, date: string): void;
  toggle(changeId: string): void;
  apply(): void;
  cancel(): void;
  undo(): void;
} {
  const qc = useQueryClient();
  const open = useCalendarioUi((s) => s.proposal);
  const setProposal = useCalendarioUi((s) => s.setProposal);
  const toggleChange = useCalendarioUi((s) => s.toggleChange);
  const [undo, setUndo] = useState<{ token: string; weekStart: string } | null>(null);
  const undoToken = undo?.weekStart === weekStart ? undo.token : null;

  const { data } = useQuery(planWeekOptions({ weekStart }));
  const { data: proposal } = useQuery({ ...proposalOptions(open?.id ?? ""), enabled: open !== null });

  // Anterior / Siguiente move the plan with the calendar: the undo of another week is not offered.

  const seed = useCallback(
    (p: Proposal) => {
      qc.setQueryData(qk.calendario.proposal(p.id), p);
      setProposal({ id: p.id, checked: p.changes.map((c) => c.changeId) });
    },
    [qc, setProposal],
  );

  const proposing = useActionMutation(
    (vars: { name: "plan_week" | "move_tasks"; input: unknown }) => runProposingToolAction(vars.name, vars.input),
    {
      setData: (_qc, p) => {
        // Nothing to place and nothing deferred: say so instead of opening an empty proposal.
        if (p.kind === "planear_semana" && p.changes.length === 0 && p.deferred.length === 0) {
          toast(PLAN_NOTHING_TO_PLAN);
          return;
        }
        seed(p);
      },
      errorContext: "calendario",
    },
  );

  const applying = useActionMutation((vars: { id: string; changeIds: string[] }) => applyProposalAction(vars.id, vars.changeIds), {
    invalidate: () => calendarioInvalidations("tasks"),
    setData: (_qc, result) => {
      setProposal(null);
      useCalendarioUi.getState().clearPlanDrops();
      setUndo(result.undoToken ? { token: result.undoToken, weekStart } : null);
      toast.success(result.toast, result.undoToken ? { action: { label: "Deshacer", onClick: () => undoing.mutate(result.undoToken!) } } : undefined);
    },
  });

  const undoing = useActionMutation((token: string) => undoProposalAction(token), {
    invalidate: () => calendarioInvalidations("tasks"),
    setData: (_qc, result) => {
      setUndo(null);
      toast.success(result.toast);
    },
  });

  const cancelling = useActionMutation((id: string) => cancelProposalAction(id), {
    setData: () => setProposal(null),
  });

  const busy = proposing.isPending || applying.isPending || undoing.isPending || cancelling.isPending;

  return {
    data,
    proposal: open ? (proposal ?? null) : null,
    checked: open?.checked ?? [],
    busy,
    canUndo: undoToken !== null,
    plan: () => {
      const taskIds = useCalendarioUi.getState().planDrops;
      proposing.mutate({ name: "plan_week", input: planInputFor(weekStart, [], taskIds) });
    },
    move: (taskId, _staffId, date) => proposing.mutate({ name: "move_tasks", input: moveInputFor(taskId, date) }),
    toggle: toggleChange,
    apply: () => {
      if (open) applying.mutate({ id: open.id, changeIds: open.checked });
    },
    cancel: () => {
      if (open) cancelling.mutate(open.id);
    },
    undo: () => {
      if (undoToken) undoing.mutate(undoToken);
    },
  };
}

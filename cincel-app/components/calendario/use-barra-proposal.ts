"use client";

import { toast } from "sonner";

import {
  applyProposalAction,
  cancelProposalAction,
  proposeFromTextAction,
  undoProposalAction,
} from "@/lib/actions/calendario-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { ApplyProposalResult, AssistantCalendarContext, Proposal } from "@/lib/types/calendario";

const UNDO_TOAST_MS = 10_000;

/** Proposal keys a change touches: the calendar, tasks, Inicio and the badges (FE §7.1). */
const APPLY_KEYS = () => [qk.calendario.all, qk.tareas.all, qk.inicio(), qk.shell.badges()] as const;

/** Hint text of the apply result when only some changes went through (FE §7.1). */
export function partialApplyText(result: ApplyProposalResult): string | null {
  if (result.skipped.length === 0) return null;
  const total = result.applied.length + result.skipped.length;
  const reason = result.skipped[0]?.reason ?? "";
  return `Apliqué ${result.applied.length} de ${total} cambios. ${result.skipped.length} ${result.skipped.length === 1 ? "no se pudo" : "no se pudieron"}${reason ? `: ${reason}` : ""}.`;
}

/**
 * The Barra para pedir flow: ask (`proposeFromTextAction`), then Aplicar /
 * Cancelar / Deshacer of the open proposal. The open proposal lives in the
 * store (`{ id, checked }`); the proposal itself is `qk.calendario.proposal(id)`.
 */
export function useBarraProposal(context: AssistantCalendarContext, opts: { onProposal?(p: Proposal): void; onError(text: string): void }) {
  const setProposal = useCalendarioUi((s) => s.setProposal);

  const undo = useActionMutation(undoProposalAction, {
    invalidate: APPLY_KEYS,
    successToast: (r) => r.toast,
  });

  const propose = useActionMutation(proposeFromTextAction, {
    errorContext: { area: "calendario" },
    onFormError: opts.onError,
    setData: (qc, proposal) => {
      qc.setQueryData(qk.calendario.proposal(proposal.id), proposal);
    },
  });

  const apply = useActionMutation((v: { id: string; changeIds: string[] }) => applyProposalAction(v.id, v.changeIds), {
    errorContext: { area: "calendario" },
    invalidate: APPLY_KEYS,
    partialFailure: partialApplyText,
  });

  const cancel = useActionMutation(cancelProposalAction, {
    errorContext: { area: "calendario" },
    invalidate: () => [qk.calendario.proposals()],
  });

  return {
    pending: propose.isPending,
    applying: apply.isPending,
    ask(text: string) {
      opts.onError("");
      propose.mutate(
        {
          text,
          view: context.view,
          from: context.from,
          to: context.to,
          ...(context.selectedDate ? { selectedDate: context.selectedDate } : {}),
        },
        {
          onSuccess: (proposal) => {
            setProposal({ id: proposal.id, checked: proposal.changes.map((c) => c.changeId) });
            opts.onProposal?.(proposal);
          },
        },
      );
    },
    apply(id: string, changeIds: string[]) {
      apply.mutate(
        { id, changeIds },
        {
          onSuccess: (result) => {
            setProposal(null);
            const token = result.undoToken;
            toast.success(result.toast, {
              duration: UNDO_TOAST_MS,
              ...(token ? { action: { label: "Deshacer", onClick: () => undo.mutate(token) } } : {}),
            });
          },
        },
      );
    },
    cancel(id: string) {
      setProposal(null);
      cancel.mutate(id);
    },
  };
}

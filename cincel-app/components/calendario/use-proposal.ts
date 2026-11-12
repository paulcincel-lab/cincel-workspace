"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { applyProposalAction, cancelProposalAction, undoProposalAction } from "@/lib/actions/calendario-actions";
import { isProposalStale } from "@/lib/calendario/proposal-view";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { calendarioInvalidations, proposalOptions } from "@/lib/query/options/calendario";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { Proposal } from "@/lib/types/calendario";

const UNDO_TOAST_MS = 10_000;

/** `?propuesta=` is URL state (FE §2.4): written without a server render. */
export function setProposalParam(id: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("propuesta", id);
  else url.searchParams.delete("propuesta");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function partialCopy(applied: number, total: number, skipped: { reason: string }[]): string {
  const failed = skipped.length;
  const reasons = skipped.map((s) => s.reason).join(", ");
  return `Apliqué ${applied} de ${total} cambios. ${failed} no se pudo${failed === 1 ? "" : "ron"}: ${reasons}.`;
}

export type UseProposal = {
  proposal: Proposal | null;
  checked: string[];
  /** The open proposal is gone, applied, cancelled or expired. */
  stale: boolean;
  isApplying: boolean;
  isCancelling: boolean;
  /** Opens `proposal` (one at a time; it replaces the open one) and seeds its query. */
  open(proposal: Proposal): void;
  /** Opens by id (`?propuesta=`); the changes are all checked once it loads. */
  openById(id: string): void;
  close(): void;
  toggle(changeId: string): void;
  apply(): void;
  cancel(): void;
};

/**
 * The open proposal (`useCalendarioUi.proposal` + `qk.calendario.proposal(id)`),
 * its checked changes and the apply / cancel / undo mutations (FE §7.1, ADR 0007).
 */
export function useProposal(): UseProposal {
  const qc = useQueryClient();
  const openState = useCalendarioUi((s) => s.proposal);
  const setProposal = useCalendarioUi((s) => s.setProposal);
  const toggleChange = useCalendarioUi((s) => s.toggleChange);
  const { data, isPending } = useQuery({ ...proposalOptions(openState?.id ?? ""), enabled: openState !== null });
  const proposal = openState ? (data ?? null) : null;
  const checked = openState?.checked ?? [];

  const close = useCallback(() => {
    setProposal(null);
    setProposalParam(null);
  }, [setProposal]);

  const open = useCallback(
    (p: Proposal) => {
      qc.setQueryData(qk.calendario.proposal(p.id), p);
      setProposal({ id: p.id, checked: p.changes.map((c) => c.changeId) });
      setProposalParam(p.id);
    },
    [qc, setProposal],
  );

  const openById = useCallback(
    (id: string) => {
      setProposal({ id, checked: [] });
      setProposalParam(id);
      void qc.fetchQuery(proposalOptions(id)).then((p) => {
        const current = useCalendarioUi.getState().proposal;
        if (p && current?.id === id && current.checked.length === 0) setProposal({ id, checked: p.changes.map((c) => c.changeId) });
      });
    },
    [qc, setProposal],
  );

  // A shared link opens its proposal once (FE §2.4).
  useEffect(() => {
    if (typeof window === "undefined" || useCalendarioUi.getState().proposal) return;
    const id = new URLSearchParams(window.location.search).get("propuesta");
    if (id) openById(id);
  }, [openById]);

  const undoMutation = useActionMutation(undoProposalAction, {
    invalidate: () => calendarioInvalidations("tasks"),
    errorContext: "calendario",
    successToast: (r) => r.toast,
  });

  const applyMutation = useActionMutation(
    (vars: { id: string; changeIds: string[] }) => applyProposalAction(vars.id, vars.changeIds),
    {
      invalidate: () => calendarioInvalidations("tasks"),
      errorContext: "calendario",
      onStaleError: () => {
        void qc.invalidateQueries({ queryKey: qk.calendario.proposals() });
      },
      staleCodes: ["STALE", "EXPIRED", "NOT_FOUND"],
    },
  );

  const cancelMutation = useActionMutation(cancelProposalAction, {
    invalidate: () => [qk.calendario.proposals()],
    errorContext: "calendario",
  });

  const apply = useCallback(() => {
    if (!openState || !proposal || openState.checked.length === 0) return;
    applyMutation.mutate(
      { id: openState.id, changeIds: openState.checked },
      {
        onSuccess: (result) => {
          const text = result.toast || partialCopy(result.applied.length, result.applied.length + result.skipped.length, result.skipped);
          const token = result.undoToken;
          toast(text, {
            duration: UNDO_TOAST_MS,
            action: token
              ? {
                  label: "Deshacer",
                  onClick: () => undoMutation.mutate(token),
                }
              : undefined,
          });
          close();
        },
      },
    );
  }, [openState, proposal, applyMutation, undoMutation, close]);

  const cancel = useCallback(() => {
    if (!openState) return;
    const id = openState.id;
    cancelMutation.mutate(id, { onSettled: close });
  }, [openState, cancelMutation, close]);

  const stale = openState !== null && !isPending && isProposalStale(proposal);

  return {
    proposal,
    checked,
    stale,
    isApplying: applyMutation.isPending,
    isCancelling: cancelMutation.isPending,
    open,
    openById,
    close,
    toggle: toggleChange,
    apply,
    cancel,
  };
}

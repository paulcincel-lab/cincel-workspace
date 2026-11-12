"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmationCard, type ConfirmationCardProps } from "@/components/asistente/ConfirmationCard";
import { setProposalParam } from "@/components/calendario/use-proposal";
import { applyProposalAction, undoProposalAction } from "@/lib/actions/calendario-actions";
import { proposalPreviewRows } from "@/lib/assistant/tool-summaries";
import { calendarioInvalidations, proposalOptions } from "@/lib/query/options/calendario";
import { useActionMutation } from "@/lib/query/mutation";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { ApplyProposalResult } from "@/lib/types/calendario";

type Props = Omit<ConfirmationCardProps, "selectable" | "outcome" | "undo">;

function proposalIdOf(props: Props): string {
  const input = props.part?.input ?? props.group?.steps[0]?.input;
  const id = input && typeof input === "object" ? (input as { proposalId?: unknown }).proposalId : undefined;
  return typeof id === "string" ? id : "";
}

function outputOf(props: Props): ApplyProposalResult | null {
  const output = props.part?.output ?? props.group?.steps[0]?.output;
  if (!output || typeof output !== "object") return null;
  const data = (output as { data?: unknown }).data ?? output;
  return data && typeof data === "object" && "applied" in data ? (data as ApplyProposalResult) : null;
}

/**
 * The confirmation card of `apply_proposal` (FE §7.5): the rows come from
 * `qk.calendario.proposal(id)`, each with a checkbox; a subset denies the
 * call with `EDITED_REASON` and applies the checked changes through the same
 * action (D8); "Deshacer" calls `undoProposalAction` while the token lasts.
 * On `/calendario` the open overlay is the same proposal and shares the checks.
 */
export function ProposalConfirmation(props: Props) {
  const proposalId = proposalIdOf(props);
  const pathname = usePathname();
  const onCalendar = typeof pathname === "string" && pathname.startsWith("/calendario");
  const { data: proposal } = useQuery({ ...proposalOptions(proposalId), enabled: proposalId !== "" });
  const items = useMemo(() => (proposal ? proposalPreviewRows(proposal) : []), [proposal]);
  const changeIds = useMemo(() => items.map((i) => i.changeId), [items]);
  const rows = useMemo(() => items.map((i) => i.row), [items]);

  const store = useCalendarioUi((s) => s.proposal);
  const setProposal = useCalendarioUi((s) => s.setProposal);
  const toggleStore = useCalendarioUi((s) => s.toggleChange);
  const shared = onCalendar && store?.id === proposalId;
  const [local, setLocal] = useState<string[] | null>(null);
  const checked = shared ? store.checked : (local ?? changeIds);
  const pending =
    (props.part?.state ?? props.group?.steps[0]?.state) === "approval-requested" ||
    props.group?.steps.some((step) => step.state === "needs-confirmation");

  // Over /calendario the overlay opens for the same proposal.
  useEffect(() => {
    if (!onCalendar || !pending || !proposalId || changeIds.length === 0) return;
    if (useCalendarioUi.getState().proposal?.id === proposalId) return;
    setProposal({ id: proposalId, checked: changeIds });
    setProposalParam(proposalId);
  }, [onCalendar, pending, proposalId, changeIds, setProposal]);

  const toggle = useCallback(
    (changeId: string) => {
      if (shared) toggleStore(changeId);
      else setLocal((prev) => ((prev ?? changeIds).includes(changeId) ? (prev ?? changeIds).filter((c) => c !== changeId) : [...(prev ?? changeIds), changeId]));
    },
    [shared, toggleStore, changeIds],
  );

  const [applied, setApplied] = useState<ApplyProposalResult | null>(null);
  const [undone, setUndone] = useState<{ text: string } | null>(null);

  const apply = useActionMutation((ids: string[]) => applyProposalAction(proposalId, ids), {
    invalidate: () => calendarioInvalidations("tasks"),
    errorContext: "calendario",
    onFormError: () => {},
  });
  const undoMutation = useActionMutation(undoProposalAction, {
    invalidate: () => calendarioInvalidations("tasks"),
    errorContext: "calendario",
    successToast: (r) => r.toast,
  });

  const [nowMs] = useState(() => Date.now());
  const result = applied ?? outputOf(props);
  const token = result?.undoToken ?? null;
  const expiresAt = result?.undoExpiresAt ? Date.parse(result.undoExpiresAt) : null;
  const tokenValid = token !== null && (expiresAt === null || Number.isNaN(expiresAt) || expiresAt > nowMs);

  const selectable: ConfirmationCardProps["selectable"] =
    rows.length > 0
      ? {
          rows,
          changeIds,
          checked,
          onToggle: toggle,
          onApplySubset: (ids) => {
            apply.mutate(ids, {
              onSuccess: (r) => {
                setApplied(r);
                if (useCalendarioUi.getState().proposal?.id === proposalId) {
                  setProposal(null);
                  setProposalParam(null);
                }
              },
            });
          },
        }
      : undefined;

  const outcome: ConfirmationCardProps["outcome"] = apply.isPending
    ? { status: "working", text: "Aplicando los cambios elegidos…" }
    : applied
      ? { status: "done", text: applied.toast }
      : apply.isError
        ? { status: "error", text: "No se pudieron aplicar los cambios. Intenta de nuevo." }
        : undefined;

  const undo: ConfirmationCardProps["undo"] = tokenValid
    ? {
        state: undone ? "done" : undoMutation.isPending ? "working" : "idle",
        doneText: undone?.text,
        onUndo: () => {
          if (!token) return;
          undoMutation.mutate(token, { onSuccess: (r) => setUndone({ text: r.toast }) });
        },
      }
    : undefined;

  return <ConfirmationCard {...props} selectable={selectable} outcome={outcome} undo={undo} />;
}

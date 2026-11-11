"use client";

import { useQuery } from "@tanstack/react-query";

import { proposalOptions } from "@/lib/query/options/calendario";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { Proposal } from "@/lib/types/calendario";

/** The open proposal (`useCalendarioUi.proposal` + `qk.calendario.proposal(id)`) and the checked changes. */
export function useProposal(): { proposal: Proposal | null; checked: string[] } {
  const open = useCalendarioUi((s) => s.proposal);
  const { data } = useQuery({ ...proposalOptions(open?.id ?? ""), enabled: open !== null });
  return { proposal: open ? (data ?? null) : null, checked: open?.checked ?? [] };
}

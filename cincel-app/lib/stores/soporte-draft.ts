"use client";

import { create } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";
import type { TicketDraft } from "@/lib/types/soporte";

/**
 * "Reportar o sugerir" UI state (#1110): whether the dialog is open and the
 * draft, so closing the dialog does not lose what was typed. Cleared on
 * success. Nothing is persisted.
 */
export type SoporteDraftState = {
  open: boolean;
  draft: TicketDraft;
  openReportar(prefill?: Partial<TicketDraft>): void;
  closeReportar(): void;
  patchDraft(patch: Partial<TicketDraft>): void;
  clearDraft(): void;
};

export const EMPTY_TICKET_DRAFT: TicketDraft = { kind: "error", title: "", description: "", steps: null };

export const useSoporteDraft = create<SoporteDraftState>((set) => ({
  open: false,
  draft: EMPTY_TICKET_DRAFT,
  openReportar: (prefill) => set((s) => ({ open: true, draft: prefill ? { ...s.draft, ...prefill } : s.draft })),
  closeReportar: () => set({ open: false }),
  patchDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  clearDraft: () => set({ draft: EMPTY_TICKET_DRAFT }),
}));

/** Back to the initial state (identity change, tests). */
export function resetSoporteDraft(): void {
  useSoporteDraft.setState({ open: false, draft: EMPTY_TICKET_DRAFT });
}

registerUiStoreReset(resetSoporteDraft);

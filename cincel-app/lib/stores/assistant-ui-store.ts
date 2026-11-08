"use client";

import { create } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";
import type { AssistantContext } from "@/lib/types/redesign";

/**
 * Assistant sheet UI state (zustand.md §2.2). One store replaces the
 * launcher's local `open`/`mounted` state, the old window event and the
 * shell-openers registry entry, so any surface (the button,
 * ⌘J, the command palette, DocumentReader) opens the same sheet.
 *
 * Nothing is persisted: the thread lives in memory across navigation and
 * `/asistente?thread=` is the deep link.
 */
export type AssistantOpenOptions = {
  context?: Partial<AssistantContext>;
  threadId?: string | null;
  prompt?: string;
};

export type AssistantUiState = {
  open: boolean;
  /** Sheet chunk requested at least once; stays true so the sheet keeps its state and close animation. */
  mounted: boolean;
  /** True while AssistantLauncher is active on this route (replaces canOpenShellOverlay("assistant")). */
  available: boolean;
  /** Caller-provided context merged over the route context (DocumentReader → { route }). */
  contextOverride: Partial<AssistantContext> | null;
  /** In memory only, not persisted. */
  threadId: string | null;
  pendingPrompt: { text: string; nonce: number } | null;
  openAssistant(opts?: AssistantOpenOptions): void;
  close(): void;
  toggle(): void;
  setOpen(open: boolean): void;
  setAvailable(available: boolean): void;
  setThreadId(id: string | null): void;
  consumePrompt(): void;
};

export const ASSISTANT_UI_INITIAL: Pick<
  AssistantUiState,
  "open" | "mounted" | "available" | "contextOverride" | "threadId" | "pendingPrompt"
> = {
  open: false,
  mounted: false,
  available: false,
  contextOverride: null,
  threadId: null,
  pendingPrompt: null,
};

let promptNonce = 0;

export const useAssistantUi = create<AssistantUiState>((set, get) => ({
  ...ASSISTANT_UI_INITIAL,
  openAssistant: (opts = {}) =>
    set({
      open: true,
      mounted: true,
      contextOverride: opts.context ?? null,
      ...(opts.threadId !== undefined ? { threadId: opts.threadId } : {}),
      ...(opts.prompt ? { pendingPrompt: { text: opts.prompt, nonce: ++promptNonce } } : {}),
    }),
  close: () => set({ open: false, contextOverride: null }),
  toggle: () => (get().open ? get().close() : set({ open: true, mounted: true })),
  setOpen: (open) => (open ? set({ open: true, mounted: true }) : get().close()),
  setAvailable: (available) =>
    set(available ? { available } : { available, open: false, contextOverride: null }),
  setThreadId: (threadId) => set({ threadId }),
  consumePrompt: () => set({ pendingPrompt: null }),
}));

/** Back to the initial state (identity change, tests). */
export function resetAssistantUi(): void {
  useAssistantUi.setState(ASSISTANT_UI_INITIAL);
}

registerUiStoreReset(resetAssistantUi);

/** Opens the assistant sheet from code outside React. */
export function openAssistant(opts?: AssistantOpenOptions): void {
  useAssistantUi.getState().openAssistant(opts);
}

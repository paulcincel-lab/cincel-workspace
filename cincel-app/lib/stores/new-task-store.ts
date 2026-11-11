"use client";

import { create } from "zustand";

import type { NewTaskDefaults } from "@/components/tareas/new-task-form";
import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * New-task dialog UI state (zustand.md §2.3). One `<NewTaskDialogHost/>`,
 * mounted once in `AppShellClient`, renders `NewTaskDialog` from this store;
 * every surface that creates a task (`?nueva=1`, the Tareas button, the
 * Tablero quick-add, the project Tareas tab, a note) calls `openNewTask`.
 *
 * Nothing is persisted: the draft lives in the dialog.
 */
export type NewTaskSource =
  | "tareas"
  | "tablero-quick-add"
  | "proyecto"
  | "nota"
  | "url"
  | "inicio"
  | "quick-add"
  | "mi-espacio"
  | "calendario";

export type NewTaskUiState = {
  open: boolean;
  defaults: NewTaskDefaults | undefined;
  source: NewTaskSource | null;
  openNewTask(defaults?: NewTaskDefaults, source?: NewTaskUiState["source"]): void;
  closeNewTask(): void;
};

export const NEW_TASK_UI_INITIAL: Pick<NewTaskUiState, "open" | "defaults" | "source"> = {
  open: false,
  defaults: undefined,
  source: null,
};

export const useNewTaskUi = create<NewTaskUiState>((set) => ({
  ...NEW_TASK_UI_INITIAL,
  openNewTask: (defaults, source = null) => set({ open: true, defaults, source }),
  // `defaults` stay until the next opening so the closing dialog keeps its content.
  closeNewTask: () => set({ open: false }),
}));

/** Back to the initial state (identity change, tests). */
export function resetNewTaskUi(): void {
  useNewTaskUi.setState(NEW_TASK_UI_INITIAL);
}

registerUiStoreReset(resetNewTaskUi);

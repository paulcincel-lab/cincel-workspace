"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_BUTTON_POSITION,
  parsePosition,
  type ButtonPosition,
} from "@/lib/assistant/button-position";
import { registerPersistedStore } from "@/components/shell/UiStoresHydrator";

/**
 * Where the floating assistant button sits, per device. UI state only: it is
 * kept in localStorage and never sent to the server. `skipHydration`:
 * `<UiStoresHydrator/>` rehydrates after mount, and the button stays hidden
 * until then so it never jumps.
 */
export type AssistantPositionState = {
  position: ButtonPosition;
  setPosition(position: ButtonPosition): void;
  reset(): void;
};

export const ASSISTANT_POSITION_STORAGE_KEY = "cincel.ui.assistant-position.v1";

export const useAssistantPosition = create<AssistantPositionState>()(
  persist(
    (set) => ({
      position: DEFAULT_BUTTON_POSITION,
      setPosition: (position) => set({ position: parsePosition(position) }),
      reset: () => set({ position: DEFAULT_BUTTON_POSITION }),
    }),
    {
      name: ASSISTANT_POSITION_STORAGE_KEY,
      version: 1,
      // Storage failures (private mode, blocked site data) leave the state in memory only.
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
        }
      }),
      partialize: (state) => ({ position: state.position }),
      // A stored value of another shape never breaks the store.
      merge: (persisted, current) => ({
        ...current,
        position: parsePosition((persisted as { position?: unknown } | null)?.position),
      }),
      skipHydration: true,
    },
  ),
);

registerPersistedStore(useAssistantPosition);

/** Back to bottom-right (reset option, tests). */
export function resetAssistantPosition(): void {
  useAssistantPosition.setState({ position: DEFAULT_BUTTON_POSITION });
}

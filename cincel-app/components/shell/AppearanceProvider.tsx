"use client";

/**
 * The appearance context moved to the `useAppearance` store
 * (`lib/stores/appearance-store.ts`, decision D2). This module re-exports it
 * under the old names so existing imports keep working; new code imports the
 * store directly.
 */
export {
  AppearanceStoreProvider as AppearanceProvider,
  applyAppearanceToDocument,
  effectiveScheme,
  TEXT_SIZE_DEBOUNCE_MS,
  useAppearance,
  type AppearanceStoreProviderProps as AppearanceProviderProps,
} from "@/lib/stores/appearance-store";

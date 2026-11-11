"use client";

import type { JSX, ReactNode } from "react";
import { createStore, type StoreApi } from "zustand";

import type { NotificationKind, NotificationPreferences } from "@/lib/types/redesign";

import { definePageStore } from "./page-store";

/**
 * Ajustes › Notificaciones form draft (page-scoped, Phase 9a): the kind ×
 * channel matrix and the quiet hours being edited, plus the inline errors.
 * The saved preferences are `qk.ajustes.page('notificaciones')`.
 */

export type NotificationChannel = "inApp" | "email" | "digest";
export type NotificationChannelValues = Record<NotificationChannel, boolean>;
export type NotificationMatrix = Record<NotificationKind, NotificationChannelValues>;

/** Matrix rows in order (FE §3.8). */
export const NOTIFICATION_MATRIX_KINDS: readonly NotificationKind[] = [
  "asignacion",
  "mencion",
  "vencimiento",
  "comentario",
  "aprobacion_cliente",
  "recordatorio",
  "sistema",
  "reunion",
];

/** Matrix columns in order. There is no Cutto column (RD-9). */
export const NOTIFICATION_MATRIX_CHANNELS: readonly NotificationChannel[] = ["inApp", "email", "digest"];

export const DEFAULT_QUIET_FROM = "20:00";
export const DEFAULT_QUIET_TO = "08:00";

export type NotificacionesDraft = {
  matrix: NotificationMatrix;
  quietEnabled: boolean;
  quietFrom: string;
  quietTo: string;
};

export type NotificacionesFormState = NotificacionesDraft & {
  /** Inline error under the quiet hours. */
  timeError: string | null;
  /** Error of the whole form (the save failed for another reason). */
  formError: string | null;
  /** A save is running (controls are disabled). */
  pending: boolean;
  setChannel(kind: NotificationKind, channel: NotificationChannel, value: boolean): void;
  setQuietEnabled(value: boolean): void;
  setQuietFrom(value: string): void;
  setQuietTo(value: string): void;
  setTimeError(message: string | null): void;
  setFormError(message: string | null): void;
  setPending(pending: boolean): void;
  /** The saved preferences become the new draft and the reset target. */
  replace(saved: NotificationPreferences): void;
  /** Back to the last saved draft, without errors. */
  reset(): void;
};

export function toNotificationMatrix(prefs: NotificationPreferences): NotificationMatrix {
  const byKind = new Map(prefs.rows.map((row) => [row.kind, row]));
  return Object.fromEntries(
    NOTIFICATION_MATRIX_KINDS.map((kind) => {
      const row = byKind.get(kind);
      return [kind, { inApp: row?.inApp ?? false, email: row?.email ?? false, digest: row?.digest ?? false }];
    }),
  ) as NotificationMatrix;
}

/** The draft for saved preferences (quiet hours off keep the default times in the inputs). */
export function toNotificacionesDraft(prefs: NotificationPreferences): NotificacionesDraft {
  return {
    matrix: toNotificationMatrix(prefs),
    quietEnabled: prefs.quietHours !== null,
    quietFrom: prefs.quietHours?.from ?? DEFAULT_QUIET_FROM,
    quietTo: prefs.quietHours?.to ?? DEFAULT_QUIET_TO,
  };
}

/** The action input for a draft. */
export function notificacionesInput(draft: NotificacionesDraft): NotificationPreferences {
  return {
    rows: NOTIFICATION_MATRIX_KINDS.map((kind) => ({ kind, ...draft.matrix[kind] })),
    quietHours: draft.quietEnabled ? { from: draft.quietFrom, to: draft.quietTo } : null,
  };
}

export function createNotificacionesFormStore(initial: NotificationPreferences): StoreApi<NotificacionesFormState> {
  let saved = toNotificacionesDraft(initial);
  return createStore<NotificacionesFormState>()((set) => ({
    ...saved,
    timeError: null,
    formError: null,
    pending: false,
    setChannel: (kind, channel, value) =>
      set((s) => ({ formError: null, matrix: { ...s.matrix, [kind]: { ...s.matrix[kind], [channel]: value } } })),
    setQuietEnabled: (quietEnabled) => set({ quietEnabled, timeError: null, formError: null }),
    setQuietFrom: (quietFrom) => set({ quietFrom, timeError: null, formError: null }),
    setQuietTo: (quietTo) => set({ quietTo, timeError: null, formError: null }),
    setTimeError: (timeError) => set({ timeError }),
    setFormError: (formError) => set({ formError }),
    setPending: (pending) => set({ pending }),
    replace: (prefs) => {
      saved = toNotificacionesDraft(prefs);
      set({ ...saved, timeError: null, formError: null });
    },
    reset: () => set({ ...saved, timeError: null, formError: null, pending: false }),
  }));
}

const notificacionesFormStore = definePageStore<NotificacionesFormState, NotificationPreferences>(
  "useNotificacionesForm",
  createNotificacionesFormStore,
);

/** One draft per mount, seeded from the saved preferences; reset on unmount. */
export const NotificacionesFormStoreProvider: (props: {
  initial: NotificationPreferences;
  children: ReactNode;
}) => JSX.Element = notificacionesFormStore.Provider;

export function useNotificacionesForm<T>(selector: (s: NotificacionesFormState) => T): T {
  return notificacionesFormStore.useSelector(selector);
}

export function useNotificacionesFormApi(): StoreApi<NotificacionesFormState> {
  return notificacionesFormStore.useApi();
}

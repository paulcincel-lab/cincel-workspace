"use client";

import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { isStrippedActionError, useActionMutation, type ActionMutationOptions } from "@/lib/query/mutation";
import { unwrapMonday } from "@/lib/query/options/monday";
import type { MondayImportResult } from "@/lib/types/monday-import";

export const MONDAY_UNEXPECTED = "Algo salió mal. Intenta de nuevo.";

/**
 * The copy of a failed Monday call. The Monday actions answer Spanish copy
 * (shown as is) or a code (`STATUS_NOT_FOUND`, `INVALID: …`, mapped by
 * `actionErrorText`); an error production stripped gets `fallback`.
 */
export function mondayErrorText(err: unknown, fallback = MONDAY_UNEXPECTED): string {
  if (!err || isStrippedActionError(err)) return fallback;
  if (actionErrorCode(err)) return actionErrorText(err);
  const message = err instanceof Error ? err.message.trim() : "";
  return message || fallback;
}

/**
 * `useActionMutation` for a Monday action (`{ ok: true, ...payload }` or
 * `{ ok: false, error }`). Errors show inline: the caller awaits
 * `mutateAsync` and puts `mondayErrorText(err)` on screen, so no toast.
 */
export function useMondayMutation<V, T extends object>(
  action: (vars: V) => Promise<MondayImportResult<T>>,
  opts: Omit<ActionMutationOptions<V, { ok: true } & T, unknown>, "onFormError" | "errorContext"> = {},
) {
  return useActionMutation<V, { ok: true } & T>(async (vars) => unwrapMonday(await action(vars)), {
    ...opts,
    onFormError: () => {},
  });
}

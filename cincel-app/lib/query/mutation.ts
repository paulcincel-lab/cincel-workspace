"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { actionErrorCode, actionErrorText, type ActionErrorContext, type ErrorContextName } from "@/lib/errors";

/** A failed action result: `ActionResult`, the portal and Google result types. */
type FailedResult = { ok: false; error: string };

/** `ActionResult<T>`'s success branch (`lib/types/schedule.ts`). */
type WrappedResult<R> = { ok: true; data: R };

export type ActionLike<V, R> = (vars: V) => Promise<R | WrappedResult<R> | FailedResult>;

/** Keys to invalidate when the mutation settles: a static list or a function of the variables and the result. */
export type InvalidateSpec<V, R> = readonly QueryKey[] | ((vars: V, data: R | undefined) => readonly QueryKey[]);

export type ActionMutationOptions<V, R, Snap> = {
  /** onSettled: `invalidateQueries` per key (prefix match). */
  invalidate?: InvalidateSpec<V, R>;
  /** onSuccess: write the result into the cache (`setQueryData`). */
  setData?: (qc: QueryClient, data: R, vars: V) => void;
  /** onMutate: patch the cache and return a snapshot; onError: roll it back. */
  optimistic?: {
    onMutate(qc: QueryClient, vars: V): Promise<Snap> | Snap;
    rollback(qc: QueryClient, snap: Snap): void;
  };
  /** The copy context for `actionErrorText`. */
  errorContext?: ActionErrorContext | ErrorContextName;
  /** Shows the error inline instead of a toast. */
  onFormError?: (text: string) => void;
  successToast?: string | ((data: R) => string);
  /**
   * Called after the error copy when the error code says the screen is stale
   * (`staleCodes`), so the caller refetches (`TeamRequests.tsx:126`).
   */
  onStaleError?: () => void;
  /** The codes that mean "stale"; defaults to `DEFAULT_STALE_CODES`. */
  staleCodes?: readonly string[];
  /**
   * A successful result that only partly applied: return the error copy for
   * the failed part, or null. It is shown after the success toast
   * (`NewTaskDialog.tsx:192-193`).
   */
  partialFailure?: (data: R) => string | null;
};

/**
 * True for an error whose message production stripped: React replaces a
 * thrown server-action message with a generic sentence and a `digest`
 * (`next/dist/server/app-render/create-error-handler.js:113`). Its message is
 * not a code and must never reach the user.
 */
export function isStrippedActionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.length > 0 && !/^[A-Z_]+(?::|$)/.test(err.message.trim());
}

/** The copy for a mutation error. A stripped production error maps to the context's generic copy. */
export function mutationErrorText(err: unknown, context: ActionErrorContext | ErrorContextName = {}): string {
  return actionErrorText(isStrippedActionError(err) ? new Error("") : err, context);
}

function isFailedResult(value: unknown): value is FailedResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function isWrappedResult<R>(value: unknown): value is WrappedResult<R> {
  if (typeof value !== "object" || value === null || (value as { ok?: unknown }).ok !== true) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes("data");
}

/**
 * Runs a server action, throwing `new Error(error)` for an `{ ok: false, error }`
 * result and unwrapping an `{ ok: true, data }` one. Other results (including
 * `{ ok: true, ...fields }`) pass through unchanged; thrown errors propagate.
 */
export async function runAction<V, R>(action: ActionLike<V, R>, vars: V): Promise<R> {
  const result = await action(vars);
  if (isFailedResult(result)) throw new Error(result.error);
  if (isWrappedResult<R>(result)) return result.data;
  return result as R;
}

/** The codes after which the screen no longer matches the server (`TeamRequests.tsx:41`). */
export const DEFAULT_STALE_CODES: readonly string[] = ["INVALID", "NOT_FOUND"];

/**
 * `useMutation` for a server action (plan §4.4). Handles both error shapes:
 * `{ ok: false, error }` results and thrown `Error("CODE")` (stripped to a
 * generic message plus `digest` in production, which gets the generic copy).
 *
 * - onMutate: `optimistic.onMutate` snapshot.
 * - onSuccess: `setData`, the `successToast`, then the `partialFailure` error toast.
 * - onError: rollback, then `onFormError(text)` or `toast.error(text)`, then
 *   `onStaleError` for a stale code.
 * - onSettled: `invalidateQueries` for each `invalidate` key.
 */
export function useActionMutation<V, R, Snap = unknown>(
  action: ActionLike<V, R>,
  opts: ActionMutationOptions<V, R, Snap> = {},
): UseMutationResult<R, Error, V, Snap | undefined> {
  const qc = useQueryClient();
  return useMutation<R, Error, V, Snap | undefined>({
    mutationFn: (vars) => runAction(action, vars),
    onMutate: opts.optimistic ? (vars) => opts.optimistic!.onMutate(qc, vars) : undefined,
    onSuccess: (data, vars) => {
      opts.setData?.(qc, data, vars);
      if (opts.successToast) {
        toast.success(typeof opts.successToast === "function" ? opts.successToast(data) : opts.successToast);
      }
      const partial = opts.partialFailure?.(data) ?? null;
      if (partial) toast.error(partial);
    },
    onError: (err, _vars, snap) => {
      if (opts.optimistic && snap !== undefined) opts.optimistic.rollback(qc, snap);
      const text = mutationErrorText(err, opts.errorContext);
      if (opts.onFormError) opts.onFormError(text);
      else toast.error(text);
      if (opts.onStaleError && (opts.staleCodes ?? DEFAULT_STALE_CODES).includes(actionErrorCode(err))) {
        opts.onStaleError();
      }
    },
    onSettled: async (data, _err, vars) => {
      const keys = typeof opts.invalidate === "function" ? opts.invalidate(vars, data) : (opts.invalidate ?? []);
      await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}

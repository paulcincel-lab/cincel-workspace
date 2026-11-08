import "server-only";

import { revalidatePath } from "next/cache";

/** One `revalidatePath` call: a path and, for layouts or dynamic segments, its type. */
export type ScreenTarget = readonly [path: string, type?: "layout" | "page"];

/**
 * Runs the `revalidatePath` calls of the chosen targets, in the order the
 * caller lists them (all of them, in declaration order, when `only` is
 * omitted). Shared by the per-screen helpers in this folder.
 */
export function revalidateTargets<K extends string>(
  targets: Readonly<Record<K, ScreenTarget>>,
  only?: readonly K[],
): void {
  const keys = only ?? (Object.keys(targets) as K[]);
  for (const key of keys) {
    const [path, type] = targets[key];
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  }
}

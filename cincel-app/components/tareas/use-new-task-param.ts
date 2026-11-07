"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The search param that opens `NewTaskDialog` (`/tareas?nueva=1`, FE §2.1). */
export const NEW_TASK_PARAM = "nueva";

/** `?…` of `params` with `nueva` set or removed; "" when nothing is left. */
export function newTaskSearch(params: URLSearchParams, open: boolean): string {
  const next = new URLSearchParams(params.toString());
  if (open) next.set(NEW_TASK_PARAM, "1");
  else next.delete(NEW_TASK_PARAM);
  const search = next.toString();
  return search ? `?${search}` : "";
}

/**
 * `?nueva=1` as the dialog's open state: opening adds the param, closing
 * removes it (`router.replace`, no scroll), keeping every other param, so the
 * view underneath stays as it was.
 */
export function useNewTaskParam(): { open: boolean; setOpen(open: boolean): void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get(NEW_TASK_PARAM) === "1";

  const setOpen = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      router.replace(`${pathname}${newTaskSearch(params, next)}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return { open, setOpen };
}

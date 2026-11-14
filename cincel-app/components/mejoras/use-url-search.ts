"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { buildUrl, editSearch } from "@/lib/soporte/mejoras-url";

export type UrlSearchWrite = "push" | "replace";

/**
 * The page's query string as React state (#1114, #1115). The state is the
 * source of truth for what the page shows, so a click updates the screen in
 * the same render instead of waiting for the router to mirror
 * `history.replaceState` into `useSearchParams` (which is what left the
 * drawer closed until a reload). Writes also go to the URL with the History
 * API so it stays shareable; back and forward (`popstate`) and navigations the
 * router reports (a link to `?solicitud=SOL-0001`) update the state again.
 *
 * `update(mutate, "push")` adds a history entry (opening a solicitud, so Back
 * closes it); `"replace"` rewrites the entry (filters, typing in the search).
 * `back()` pops the entry a `"push"` added, or replaces when there is none.
 */
export function useUrlSearch(): {
  search: string;
  update(mutate: (params: URLSearchParams) => void, how?: UrlSearchWrite): void;
  /** Removes `name` leaving the entry that opened it: Back when this page pushed it, else replace. */
  dismiss(name: string): void;
} {
  const fromRouter = useSearchParams()?.toString() ?? "";
  const [search, setSearch] = useState(fromRouter);
  const current = useRef(search);
  const pushed = useRef(0);

  const commit = useCallback((next: string) => {
    current.current = next;
    setSearch(next);
  }, []);

  // A navigation the router reports (link, redirect): follow it.
  useEffect(() => {
    if (fromRouter !== current.current) commit(fromRouter);
    // `current` is read on purpose: only a router change must overwrite the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRouter]);

  // Back and forward.
  useEffect(() => {
    const onPop = () => {
      pushed.current = 0;
      commit(window.location.search.replace(/^\?/, ""));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [commit]);

  const update = useCallback(
    (mutate: (params: URLSearchParams) => void, how: UrlSearchWrite = "replace") => {
      const next = editSearch(current.current, mutate);
      if (next === current.current) return;
      commit(next);
      if (typeof window === "undefined") return;
      const url = buildUrl(window.location.pathname, next, window.location.hash);
      if (how === "push") {
        pushed.current += 1;
        window.history.pushState(window.history.state, "", url);
      } else {
        window.history.replaceState(window.history.state, "", url);
      }
    },
    [commit],
  );

  const dismiss = useCallback(
    (name: string) => {
      if (pushed.current > 0 && typeof window !== "undefined") {
        pushed.current -= 1;
        commit(editSearch(current.current, (params) => params.delete(name)));
        window.history.back();
        return;
      }
      update((params) => params.delete(name), "replace");
    },
    [update, commit],
  );

  return { search, update, dismiss };
}

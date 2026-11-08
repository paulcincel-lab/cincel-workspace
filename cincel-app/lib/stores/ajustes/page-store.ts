"use client";

import { createContext, createElement, useContext, useEffect, useRef, type JSX, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

/**
 * Page-scoped Zustand stores for the Ajustes form drafts (zustand.md §2.9,
 * decision D3): `createStore` + a provider that creates one store per mount
 * (`useRef`), so two mounts never share state and leaving the page drops the
 * draft. Saved data lives in TanStack Query; these stores hold only drafts,
 * errors and dialog state.
 */
export type PageStore<S, I> = {
  /** One store per mount, seeded from `initial` once; `reset()` runs on unmount. */
  Provider(props: { initial: I; children?: ReactNode }): JSX.Element;
  /** Subscribes to one slice of the nearest provider's store. */
  useSelector<T>(selector: (state: S) => T): T;
  /** The nearest provider's store, for reads that must not subscribe. */
  useApi(): StoreApi<S>;
};

export function definePageStore<S extends { reset(): void }, I>(
  name: string,
  create: (initial: I) => StoreApi<S>,
): PageStore<S, I> {
  const StoreContext = createContext<StoreApi<S> | null>(null);

  function Provider({ initial, children }: { initial: I; children?: ReactNode }): JSX.Element {
    const ref = useRef<StoreApi<S> | null>(null);
    if (ref.current === null) ref.current = create(initial);
    useEffect(() => {
      const store = ref.current;
      return () => store?.getState().reset();
    }, []);
    return createElement(StoreContext.Provider, { value: ref.current }, children);
  }

  function useApi(): StoreApi<S> {
    const store = useContext(StoreContext);
    if (!store) throw new Error(`${name} must be used inside its provider`);
    return store;
  }

  function useSelector<T>(selector: (state: S) => T): T {
    return useStore(useApi(), selector);
  }

  return { Provider, useSelector, useApi };
}

"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import {
  analiticoTeamParams,
  parseAnaliticoTeamParams,
  replaceSearchParams,
  type AnaliticoTeamUrlState,
} from "@/lib/personas/url-state";

/**
 * Filters and expanded state of Personas · Analítico, kept in the URL
 * (`?estado`, `?etapa`, `?alcance`, `?q`, `?abiertos`, `?persona`) so they
 * survive a reload. Read once from the URL; every change updates the local
 * state and swaps the params with `history.replaceState` (no navigation).
 */
export function useTeamAnaliticoState(): [AnaliticoTeamUrlState, (patch: Partial<AnaliticoTeamUrlState>) => void] {
  const searchParams = useSearchParams();
  const [state, setState] = useState<AnaliticoTeamUrlState>(() => parseAnaliticoTeamParams(searchParams));
  const update = useCallback((patch: Partial<AnaliticoTeamUrlState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      replaceSearchParams(analiticoTeamParams(next));
      return next;
    });
  }, []);
  return [state, update];
}

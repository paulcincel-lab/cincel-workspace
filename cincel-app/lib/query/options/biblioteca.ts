import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getBibliotecaPageData, getMisVacacionesPageData } from "@/lib/actions/page-data/biblioteca-actions";
import type { BibliotecaLinksSection } from "@/lib/biblioteca/catalog";
import type { BibliotecaData, MisVacacionesPageData } from "@/lib/loaders/biblioteca";
import { STALE, qk } from "@/lib/query/keys";
import type { PendingVacationRequest, TeamAbsence, VacationSettingsView } from "@/lib/types/redesign";
import type { MyVacations } from "@/lib/vacations/reads";

/** Prefix of every `qk.biblioteca.links(section)`: favorites invalidate all of them. */
export const BIBLIOTECA_LINKS_PREFIX = ["biblioteca", "links"] as const;

/** Prefix of every `qk.vacations.absences(month)`. */
export const VACATIONS_ABSENCES_PREFIX = ["vacations", "absences"] as const;

/**
 * One Biblioteca screen's links (`qk.biblioteca.links(section)`, plan §4.3):
 * null is the index, "empresa" the company documents, a Recursos section its
 * own rows plus the viewer's favorites. 30 s stale. The server page seeds it
 * from the loader, so the first render needs no request.
 */
export function bibliotecaLinksOptions(section: BibliotecaLinksSection | null) {
  return queryOptions<BibliotecaData>({
    queryKey: qk.biblioteca.links(section),
    queryFn: () => getBibliotecaPageData({ section }),
    staleTime: STALE.screen,
  });
}

// ── Mis vacaciones ──────────────────────────────────────────────────────────

/**
 * Writes one `getMisVacacionesPageData` bundle into its granular keys:
 * `me.vacations`, `vacations.absences(month)`, `vacations.pending`,
 * `vacations.settings` and `biblioteca.links('mis-vacaciones')`. Pending
 * and settings are null for a viewer who may not decide vacations. Used by
 * the server page (on the request's client) and by the query functions below.
 */
export function seedMisVacaciones(client: QueryClient, data: MisVacacionesPageData): void {
  client.setQueryData<MyVacations | null>(qk.me.vacations(), data.mine);
  client.setQueryData<TeamAbsence[] | null>(qk.vacations.absences(data.month), data.absences);
  client.setQueryData<PendingVacationRequest[] | null>(qk.vacations.pending(), data.deciders?.requests ?? null);
  client.setQueryData<VacationSettingsView | null>(qk.vacations.settings(), data.deciders?.settings ?? null);
  client.setQueryData<BibliotecaData>(qk.biblioteca.links("mis-vacaciones"), data.library);
}

/** In-flight page-data calls per month, so keys refetched together share one POST. */
const inflight = new Map<string, Promise<MisVacacionesPageData>>();

/**
 * One `getMisVacacionesPageData({ month })` call, shared by every Mis
 * vacaciones key that refetches at the same time (an invalidation marks
 * several), and seeded into all of them. Side-effect free on the server.
 */
export function fetchMisVacaciones(client: QueryClient, month: string): Promise<MisVacacionesPageData> {
  const running = inflight.get(month);
  if (running) return running;
  const call = getMisVacacionesPageData({ month })
    .then((data) => {
      seedMisVacaciones(client, data);
      return data;
    })
    .finally(() => inflight.delete(month));
  inflight.set(month, call);
  return call;
}

/** `qk.me.vacations()`: the viewer's balance and requests of this year. `month` is the page's strip month. */
export function myVacationsOptions(month: string) {
  return queryOptions<MyVacations | null>({
    queryKey: qk.me.vacations(),
    queryFn: async ({ client }) => (await fetchMisVacaciones(client, month)).mine,
    staleTime: STALE.screen,
  });
}

/** `qk.vacations.absences(month)`: who is away that month. */
export function vacationAbsencesOptions(month: string) {
  return queryOptions<TeamAbsence[] | null>({
    queryKey: qk.vacations.absences(month),
    queryFn: async ({ client }) => (await fetchMisVacaciones(client, month)).absences,
    staleTime: STALE.screen,
  });
}

/** `qk.vacations.pending()`: the team's pending requests (deciders only; null otherwise). */
export function pendingVacationsOptions(month: string) {
  return queryOptions<PendingVacationRequest[] | null>({
    queryKey: qk.vacations.pending(),
    queryFn: async ({ client }) => (await fetchMisVacaciones(client, month)).deciders?.requests ?? null,
    staleTime: STALE.screen,
  });
}

/** `qk.vacations.settings()`: days per year and overrides (deciders only; null otherwise). */
export function vacationSettingsOptions(month: string) {
  return queryOptions<VacationSettingsView | null>({
    queryKey: qk.vacations.settings(),
    queryFn: async ({ client }) => (await fetchMisVacaciones(client, month)).deciders?.settings ?? null,
    staleTime: STALE.screen,
  });
}

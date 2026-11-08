import { queryOptions } from "@tanstack/react-query";

import {
  getPersonasContactsPageData,
  getPersonasCountsAction,
  getPersonasEquipoPageData,
} from "@/lib/actions/page-data/personas-actions";
import { fetchPersonaDetailAction } from "@/lib/actions/people-actions";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import type { PersonasContactsProps } from "@/components/personas/PersonasContacts";
import type { EquipoViewProps } from "@/components/personas/EquipoView";
import type { PersonasContactsTab } from "@/lib/personas/contacts";
import type { PersonasTab } from "@/lib/personas/team";
import { STALE, qk } from "@/lib/query/keys";
import type { Position } from "@/lib/types/core";
import type { PersonaDetail } from "@/lib/types/redesign";

/**
 * `queryOptions` for the Personas screens (Query Migration 6, #940), 30 s
 * stale; the puestos catalog 5 min. The server pages prefetch the same keys
 * with the loaders in `lib/loaders/personas.ts`. The query functions only read.
 * The contact sheet's keys (`contacts.*`) are in `./contacts`.
 */

/** Prefix of every contacts tab (`personas.contacts(tab, tipo)`), for invalidation. */
export const PERSONAS_CONTACTS_PREFIX = qk.personas.contacts("clientes", null).slice(0, 2);
/** Prefix of every `catalog.contacts(type)` picker list, for invalidation. */
export const CATALOG_CONTACTS_PREFIX = qk.catalog.contacts().slice(0, 2);

export function personasEquipoOptions() {
  return queryOptions<Omit<EquipoViewProps, "counts">>({
    queryKey: qk.personas.equipo(),
    queryFn: () => getPersonasEquipoPageData({}),
    staleTime: STALE.screen,
  });
}

export function personasCountsOptions() {
  return queryOptions<Record<PersonasTab, number>>({
    queryKey: qk.personas.counts(),
    queryFn: () => getPersonasCountsAction({}),
    staleTime: STALE.screen,
  });
}

/** One contacts tab. `tipo` is the Proveedores sub-filter (null elsewhere). */
export function personasContactsOptions(tab: PersonasContactsTab, tipo: string | null) {
  return queryOptions<Omit<PersonasContactsProps, "counts">>({
    queryKey: qk.personas.contacts(tab, tipo),
    queryFn: () => getPersonasContactsPageData({ tab, tipo }),
    staleTime: STALE.screen,
  });
}

/** Persona detalle; null when the person doesn't exist. */
export function personasDetailOptions(staffId: string) {
  return queryOptions<PersonaDetail | null>({
    queryKey: qk.personas.detail(staffId),
    queryFn: () => fetchPersonaDetailAction({ staffId }),
    staleTime: STALE.screen,
  });
}

/** The puestos catalog of the collaborator editor (read when the drawer opens). */
export function personasPositionsOptions() {
  return queryOptions<Position[]>({
    queryKey: qk.personas.positions(),
    queryFn: () => fetchPositionsAction(),
    staleTime: STALE.catalog,
  });
}

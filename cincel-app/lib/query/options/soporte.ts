import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";

import { listMejorasAction, mejorasCountsAction } from "@/lib/actions/mejoras-actions";
import { getTicketAction, listMyTicketsAction } from "@/lib/actions/soporte-actions";
import { STALE, qk } from "@/lib/query/keys";
import type { MejorasCounts, TicketDetail, TicketFilters, TicketsPage } from "@/lib/types/soporte";

type PageParams = { pages: TicketsPage[]; pageParams: (string | null)[] };

/** Mis solicitudes: the cursor is the page param. */
export function myTicketsInfiniteOptions(filters: TicketFilters) {
  return infiniteQueryOptions<TicketsPage, Error, PageParams, readonly unknown[], string | null>({
    queryKey: qk.soporte.mine(filters),
    queryFn: ({ pageParam }) => listMyTicketsAction({ ...filters, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/** One solicitud (author or `canManageSupport`; the author gets public events only). */
export function ticketOptions(id: string) {
  return queryOptions<TicketDetail | null>({
    queryKey: qk.soporte.ticket(id),
    queryFn: () => getTicketAction(id),
    staleTime: STALE.screen,
  });
}

/** Mejoras rows: the cursor is the page param. */
export function mejorasListInfiniteOptions(filters: TicketFilters) {
  return infiniteQueryOptions<TicketsPage, Error, PageParams, readonly unknown[], string | null>({
    queryKey: qk.mejoras.list(filters),
    queryFn: ({ pageParam }) => listMejorasAction({ ...filters, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/** Counts per status and the `nuevo` count of the nav badge. */
export function mejorasCountsOptions() {
  return queryOptions<MejorasCounts>({
    queryKey: qk.mejoras.counts(),
    queryFn: () => mejorasCountsAction(),
    staleTime: STALE.shellBadges,
  });
}

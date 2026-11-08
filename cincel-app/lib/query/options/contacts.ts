import { queryOptions } from "@tanstack/react-query";

import { fetchContactAction, fetchContactHistoryAction } from "@/lib/actions/contacts-actions";
import { STALE, qk } from "@/lib/query/keys";
import type { ContactDetail, HistoryEvent } from "@/lib/types/core";

/**
 * The contact sheet's `queryOptions` (`qk.contacts`, Query Migration 6),
 * 30 s stale. Read-only query functions.
 */

/** A contact's sheet; null when it can't be read. */
export function contactDetailOptions(id: string) {
  return queryOptions<ContactDetail | null>({
    queryKey: qk.contacts.detail(id),
    queryFn: () => fetchContactAction(id),
    staleTime: STALE.screen,
  });
}

export function contactHistoryOptions(id: string) {
  return queryOptions<HistoryEvent[]>({
    queryKey: qk.contacts.history(id),
    queryFn: () => fetchContactHistoryAction(id),
    staleTime: STALE.screen,
  });
}

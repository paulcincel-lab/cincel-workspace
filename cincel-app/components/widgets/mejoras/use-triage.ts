"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { updateTicketAction } from "@/lib/actions/mejoras-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { mejorasListInfiniteOptions } from "@/lib/query/options/soporte";
import { inverseChange, patchCounts, patchPages, type TriageChange } from "@/lib/soporte/mejoras-triage";
import type { MejorasCounts, TicketFilters, TicketListRow, TicketsPage } from "@/lib/types/soporte";

type ListData = InfiniteData<TicketsPage, string | null>;
type Snapshot = { lists: [readonly unknown[], ListData | undefined][]; counts: MejorasCounts | undefined };
type Vars = { changes: TriageChange[] };
type Outcome = { applied: string[]; failed: number };

const LIST_PREFIX = [...qk.mejoras.all, "list"] as const;

/** Every row the cached lists hold, by id (the source of the "before" values for Deshacer). */
function cachedRows(qc: QueryClient): Map<string, TicketListRow> {
  const rows = new Map<string, TicketListRow>();
  for (const [, data] of qc.getQueriesData<ListData>({ queryKey: LIST_PREFIX })) {
    for (const page of data?.pages ?? []) for (const row of page.rows) if (!rows.has(row.id)) rows.set(row.id, row);
  }
  return rows;
}

/** One `updateTicketAction` per change; one failure does not stop the others. */
async function runChanges({ changes }: Vars): Promise<{ ok: true; data: Outcome } | { ok: false; error: string }> {
  const results = await Promise.all(
    changes.map(async (change) => {
      try {
        return { id: change.id, result: await updateTicketAction(change.id, change.patch) };
      } catch (err) {
        return { id: change.id, result: { ok: false as const, error: err instanceof Error ? err.message : "INTERNAL" } };
      }
    }),
  );
  const applied = results.filter((r) => r.result.ok).map((r) => r.id);
  const firstError = results.find((r) => !r.result.ok)?.result;
  if (applied.length === 0 && firstError && !firstError.ok) return { ok: false, error: firstError.error };
  return { ok: true, data: { applied, failed: results.length - applied.length } };
}

/** The rows of the Mejoras list for `filters`, flattened, with the paging controls. */
export function useMejorasRows(filters: TicketFilters) {
  const query = useInfiniteQuery(mejorasListInfiniteOptions(filters));
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);
  return {
    rows,
    isPending: query.isPending,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

/** Toast copy of a finished triage. */
export function triageToastText(count: number, failed: number): string {
  const done = count === 1 ? "1 solicitud actualizada" : `${count} solicitudes actualizadas`;
  if (failed === 0) return `${done}.`;
  return `${done}; ${failed === 1 ? "1 no se pudo cambiar" : `${failed} no se pudieron cambiar`}.`;
}

/**
 * The triage write of Mejoras (drag, cell edit, bulk): patches the cached
 * lists and counts at once, sends one `updateTicketAction` per row, and
 * refetches the lists, the counts (the nav badge) and each open detail when
 * it settles. The success toast carries Deshacer, which sends the previous
 * values back (and writes its own events).
 */
export function useTriage() {
  const qc = useQueryClient();
  const mutation = useActionMutation<Vars, Outcome, Snapshot>(runChanges, {
    optimistic: {
      onMutate: async (_qc, vars) => {
        await qc.cancelQueries({ queryKey: qk.mejoras.all });
        const snapshot: Snapshot = {
          lists: qc.getQueriesData<ListData>({ queryKey: LIST_PREFIX }),
          counts: qc.getQueryData<MejorasCounts>(qk.mejoras.counts()),
        };
        const rows = cachedRows(qc);
        qc.setQueriesData<ListData>({ queryKey: LIST_PREFIX }, (data) => (data ? patchPages(data, vars.changes) : data));
        if (snapshot.counts) {
          const moves = vars.changes.flatMap((change) => {
            const row = rows.get(change.id);
            return row && change.patch.status ? [{ from: row.status, to: change.patch.status }] : [];
          });
          qc.setQueryData<MejorasCounts>(qk.mejoras.counts(), patchCounts(snapshot.counts, moves));
        }
        return snapshot;
      },
      rollback: (_qc, snapshot) => {
        for (const [key, data] of snapshot.lists) qc.setQueryData(key, data);
        if (snapshot.counts) qc.setQueryData(qk.mejoras.counts(), snapshot.counts);
      },
    },
    invalidate: (vars) => [qk.mejoras.all, ...vars.changes.map((change) => qk.soporte.ticket(change.id)), qk.soporte.all],
  });

  const { mutateAsync } = mutation;

  /** Sends `changes`; null when the mutation failed (it already showed the error and rolled back). */
  const send = useCallback(
    async (changes: TriageChange[]): Promise<Outcome | null> => {
      try {
        return await mutateAsync({ changes });
      } catch {
        return null;
      }
    },
    [mutateAsync],
  );

  /** Applies `changes`; the toast offers an undo that sends the inverse changes. */
  const apply = useCallback(
    async (changes: TriageChange[]): Promise<void> => {
      if (changes.length === 0) return;
      const before = cachedRows(qc);
      const outcome = await send(changes);
      if (!outcome) return;
      const applied = new Set(outcome.applied);
      const inverses = changes.flatMap((change) => {
        const row = before.get(change.id);
        return row && applied.has(change.id) ? [inverseChange(row, change)] : [];
      });
      const text = triageToastText(outcome.applied.length, outcome.failed);
      if (inverses.length === 0) toast.success(text);
      else toast.success(text, { action: { label: "Deshacer", onClick: () => void send(inverses) } });
    },
    [qc, send],
  );

  return { apply, isPending: mutation.isPending };
}

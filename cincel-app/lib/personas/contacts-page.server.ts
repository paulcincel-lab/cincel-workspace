import "server-only";

import type { QueryClient } from "@tanstack/react-query";
import { notFound, redirect } from "next/navigation";

import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadPersonasContacts, loadPersonasCounts } from "@/lib/loaders/personas";
import { parseProveedoresSubfilter, type PersonasContactsTab } from "@/lib/personas/contacts";
import { STALE, qk } from "@/lib/query/keys";
import { getQueryClient, prefetch } from "@/lib/query/server";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Server side of `/personas/{clientes,contratistas,proveedores}` (redesign FE
 * §3.6, §2.1; Query Migration 6): session, the `clients.canViewClients`
 * route rule (404 otherwise), then the prefetch of the tab's
 * `personas.contacts(tab, tipo)` (its own contact types only, origin data
 * stripped for viewers without `canSeeAdminData`, in the loader) and the
 * shared `personas.counts()`. The page renders `PersonasContactsScreen`
 * under `<Hydrate qc>`.
 */
export async function preparePersonasContactsPage(
  tab: PersonasContactsTab,
  searchParams: SearchParams,
): Promise<{ qc: QueryClient; tab: PersonasContactsTab; tipo: string | null }> {
  let user: Awaited<ReturnType<typeof requireCapabilityUser>>;
  try {
    user = await requireCapabilityUser();
  } catch {
    redirect("/login");
  }

  if (!resolveClientsCapabilities(user).canViewClients) notFound();

  const tipo = tab === "proveedores" ? parseProveedoresSubfilter(searchParams.tipo) : null;
  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, { queryKey: qk.personas.contacts(tab, tipo), staleTime: STALE.screen }, () =>
      loadPersonasContacts(user, { tab, tipo }),
    ),
    prefetch(qc, { queryKey: qk.personas.counts(), staleTime: STALE.screen }, () => loadPersonasCounts(user)),
  ]);
  return { qc, tab, tipo };
}

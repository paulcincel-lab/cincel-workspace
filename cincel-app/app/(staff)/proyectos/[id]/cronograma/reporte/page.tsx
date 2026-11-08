import { CronogramaReport } from "@/components/cronograma/cronograma-report";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoCronograma } from "@/lib/loaders/proyectos";
import { Hydrate } from "@/lib/query/hydrate";
import { proyectoCronogramaOptions } from "@/lib/query/options/proyectos";
import { getQueryClient, prefetch } from "@/lib/query/server";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;

/** The signed-in staff member; null without a usable session. Redirects propagate. */
async function loadUser(): Promise<CapabilityUser | null> {
  try {
    return await requireCapabilityUser();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
}

/**
 * `/proyectos/[id]/cronograma/reporte` (Query Migration 5c, #961): prefetches
 * the same `proyectos.cronograma(id)` as the Cronograma tab (one source, with
 * payments stripped by the loader for non-admins), so the client reuses the
 * cache. `?asOf=` is render-only.
 */
export default async function CronogramaReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const [{ id: projectId }, { asOf }, user] = await Promise.all([params, searchParams, loadUser()]);

  const qc = getQueryClient();
  await prefetch(qc, proyectoCronogramaOptions(projectId), () =>
    user ? loadProyectoCronograma(user, { id: projectId }) : Promise.resolve(null)
  );

  // Only the report sheet prints; the shell around it (sidebar, assistant
  // button, toolbar) is hidden on paper (redesign FE §3.5).
  return (
    <>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          [data-print-root], [data-print-root] * { visibility: visible; }
          [data-print-root] { position: absolute; left: 0; top: 0; width: 100%; }
          section, [data-slot="card"] { break-inside: avoid; }
        }
      `}</style>
      <Hydrate qc={qc}>
        <CronogramaReport projectId={projectId} asOf={asOf ?? null} />
      </Hydrate>
    </>
  );
}

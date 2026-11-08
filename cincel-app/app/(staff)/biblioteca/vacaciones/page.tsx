import { MisVacacionesClient } from "@/components/biblioteca/MisVacacionesClient";
import { TeamRequests } from "@/components/biblioteca/TeamRequests";
import { VacationSettings } from "@/components/biblioteca/VacationSettings";
import { requireBibliotecaViewer } from "@/lib/biblioteca/load";
import { loadMisVacacionesPageData } from "@/lib/loaders/biblioteca";
import { Hydrate } from "@/lib/query/hydrate";
import { seedMisVacaciones } from "@/lib/query/options/biblioteca";
import { getQueryClient } from "@/lib/query/server";

/**
 * `/biblioteca/vacaciones` (redesign FE §3.7): Mis vacaciones, loaded in one
 * wave. The page-data loader reads everything in one `Promise.all` and the
 * bundle is seeded into `me.vacations`, `vacations.absences(month)`,
 * `vacations.pending`, `vacations.settings` and
 * `biblioteca.links('mis-vacaciones')`; the sections read those queries.
 * "Solicitudes del equipo" and "Días de vacaciones" render only for deciders
 * (`deciders` is null otherwise). A `?estilo=` preview is read from the URL
 * on the client (FE §4.2).
 */
export default async function MisVacacionesPage() {
  const user = await requireBibliotecaViewer();
  const data = await loadMisVacacionesPageData(user, {});

  const qc = getQueryClient();
  seedMisVacaciones(qc, data);

  return (
    <Hydrate qc={qc}>
      <div className="flex flex-col gap-6">
        <MisVacacionesClient month={data.month} year={data.year} />
        {data.deciders ? (
          <div className="flex flex-col gap-6">
            <TeamRequests month={data.month} viewerStaffId={data.deciders.viewerStaffId} canDecide />
            {data.deciders.settings ? <VacationSettings month={data.month} canDecide /> : null}
          </div>
        ) : null}
      </div>
    </Hydrate>
  );
}

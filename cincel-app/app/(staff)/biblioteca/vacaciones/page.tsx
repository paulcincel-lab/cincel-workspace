import { MisVacacionesClient } from "@/components/biblioteca/MisVacacionesClient";
import { VacationDeciders } from "@/components/biblioteca/VacationDeciders";

import { loadMisVacaciones } from "./load-mis-vacaciones";

/**
 * `/biblioteca/vacaciones` (redesign FE §3.7): Mis vacaciones. A `?estilo=`
 * preview is read from the URL by `useStyle` (FE §4.2).
 */
export default async function MisVacacionesPage() {
  const data = await loadMisVacaciones();
  return (
    <div className="flex flex-col gap-6">
      <MisVacacionesClient {...data} />
      <VacationDeciders />
    </div>
  );
}

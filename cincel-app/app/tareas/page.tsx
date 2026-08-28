import { Suspense } from "react";

import TareasPageClient from "./TareasPageClient";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";

export default async function TareasPage() {
  let initialActivities;
  try {
    const [presale, diseno, construccion] = await Promise.all([
      fetchActivitiesAction("Presale"),
      fetchActivitiesAction("Diseño"),
      fetchActivitiesAction("Construcción"),
    ]);
    initialActivities = { presale, diseno, construccion };
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }

  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-800">Cargando actividades...</div>}>
      <TareasPageClient initialActivities={initialActivities} />
    </Suspense>
  );
}

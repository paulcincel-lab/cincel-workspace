import { Suspense } from "react";

import TareasPageClient from "./TareasPageClient";

export default function TareasPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-800">Cargando actividades...</div>}>
      <TareasPageClient />
    </Suspense>
  );
}
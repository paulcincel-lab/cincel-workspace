import { Suspense } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import PresaleTable from "@/components/tareas/PresaleTable";

export default function PresalePage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando actividades...</div>}>
          <PresaleTable />
        </Suspense>

      </section>

    </main>
  );
}
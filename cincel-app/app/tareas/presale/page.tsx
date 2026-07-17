import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import PresaleTable from "@/components/tareas/PresaleTable";

export default function PresalePage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <PresaleTable />

      </section>

    </main>
  );
}
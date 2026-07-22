import Sidebar from "@/components/layout/Sidebar";
import KpiCard from "@/components/dashboard/KpiCard";

export default function Home() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10">

        <h1 className="text-5xl font-bold">
          Buenos días, Paul 👋
        </h1>

        <p className="text-slate-500 mt-2">
          Bienvenido a Cincel Workspace
        </p>

        <div className="grid grid-cols-4 gap-6 mt-10">

          <KpiCard
            title="Proyectos"
            value="8"
          />

          <KpiCard
            title="Tareas"
            value="31"
          />

          <KpiCard
            title="Equipo"
            value="8"
          />

          <KpiCard
            title="Avance"
            value="72%"
          />

        </div>

      </section>

    </main>
  );
}
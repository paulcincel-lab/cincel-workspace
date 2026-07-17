import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ProjectsTable from "@/components/proyectos/ProjectsTable";

export default function ProyectosPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <ProjectsTable />

      </section>

    </main>
  );
}
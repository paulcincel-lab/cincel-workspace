import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function ConfiguracionPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-3xl font-bold text-slate-900">Configuración</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ajusta opciones generales del sistema y accesos del workspace.
          </p>
        </div>
      </section>

    </main>
  );
}
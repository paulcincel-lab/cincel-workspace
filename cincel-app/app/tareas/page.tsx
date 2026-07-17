import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Link from "next/link";

export default function TareasPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10">

        <Header />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">

          <h1 className="text-3xl font-bold">
            Tareas
          </h1>

          <p className="text-slate-500 mt-2">
            Gestiona las plantillas de trabajo de Cincel.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mt-10">

            <Link href="/tareas/presale">

              <div className="border rounded-2xl p-8 hover:shadow-lg transition cursor-pointer">

                <div className="text-5xl">
                  📁
                </div>

                <h2 className="text-2xl font-bold mt-5">
                  Presale
                </h2>

                <p className="text-slate-500 mt-2">
                  Flujo comercial
                </p>

              </div>

            </Link>

            <Link href="/tareas/diseno">

              <div className="border rounded-2xl p-8 hover:shadow-lg transition cursor-pointer">

                <div className="text-5xl">
                  📐
                </div>

                <h2 className="text-2xl font-bold mt-5">
                  Diseño
                </h2>

                <p className="text-slate-500 mt-2">
                  Anteproyecto, Proyecto y Ejecutivo
                </p>

              </div>

            </Link>

            <Link href="/tareas/construccion">

              <div className="border rounded-2xl p-8 hover:shadow-lg transition cursor-pointer">

                <div className="text-5xl">
                  🚧
                </div>

                <h2 className="text-2xl font-bold mt-5">
                  Construcción
                </h2>

                <p className="text-slate-500 mt-2">
                  Residencia y Postventa
                </p>

              </div>

            </Link>

          </div>

        </div>

      </section>

    </main>
  );
}
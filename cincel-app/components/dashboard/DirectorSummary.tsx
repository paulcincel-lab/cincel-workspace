export default function DirectorSummary() {
  return (
    <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">

      <h2 className="text-xl font-semibold mb-5">
        Resumen del Director
      </h2>

      <div className="space-y-4 text-sm">

        <div className="flex justify-between border-b border-slate-700 pb-2">
          <span>Proyectos activos</span>
          <span className="font-semibold">8</span>
        </div>

        <div className="flex justify-between border-b border-slate-700 pb-2">
          <span>Obras en ejecución</span>
          <span className="font-semibold">3</span>
        </div>

        <div className="flex justify-between border-b border-slate-700 pb-2">
          <span>Tareas vencidas</span>
          <span className="font-semibold text-red-400">4</span>
        </div>

        <div className="flex justify-between border-b border-slate-700 pb-2">
          <span>Reuniones hoy</span>
          <span className="font-semibold">5</span>
        </div>

        <div className="flex justify-between">
          <span>Equipo conectado</span>
          <span className="font-semibold text-green-400">
            7 / 8
          </span>
        </div>

      </div>

    </section>
  );
}
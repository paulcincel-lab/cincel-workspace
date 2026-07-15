const tasks = [
  {
    project: "Ensenada",
    status: "Proyecto Ejecutivo",
    color: "bg-red-500",
  },
  {
    project: "Platzi",
    status: "Esperando respuesta del cliente",
    color: "bg-yellow-400",
  },
  {
    project: "NeoGen",
    status: "Obra en proceso",
    color: "bg-green-500",
  },
];

export default function TasksToday() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

      <h2 className="text-xl font-semibold text-slate-900 mb-6">
        Hoy requieren atención
      </h2>

      <div className="space-y-4">

        {tasks.map((task) => (
          <div
            key={task.project}
            className="flex items-center gap-4"
          >
            <div
              className={`w-3 h-3 rounded-full ${task.color}`}
            />

            <div>

              <div className="font-medium text-slate-800">
                {task.project}
              </div>

              <div className="text-sm text-slate-500">
                {task.status}
              </div>

            </div>

          </div>
        ))}

      </div>

    </section>
  );
}
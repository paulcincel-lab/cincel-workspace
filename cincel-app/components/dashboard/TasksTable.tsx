import { tasks } from "@/lib/data/tasks";

export default function TasksTable() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold">
          Mis tareas
        </h2>

        <p className="text-slate-500">
          Tareas asignadas para hoy
        </p>
      </div>

      <table className="w-full">
        <thead className="bg-slate-50">
          <tr className="text-left text-sm text-slate-600">
            <th className="p-4">Proyecto</th>
            <th>Fase</th>
            <th>Tarea</th>
            <th>Responsable</th>
            <th>Apoyo</th>
            <th>Prioridad</th>
            <th>Estatus</th>
            <th>Entrega</th>
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="p-4 font-medium">
                {task.project}
              </td>

              <td>
                {task.phase}
              </td>

              <td>
                {task.title}
              </td>

              <td className="font-medium">
                {task.assignedTo}
              </td>

              <td>
                {task.support.length > 0
                  ? task.support.join(", ")
                  : "-"}
              </td>

              <td>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    task.priority === "Alta"
                      ? "bg-red-100 text-red-700"
                      : task.priority === "Media"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {task.priority}
                </span>
              </td>

              <td>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    task.status === "Pendiente"
                      ? "bg-yellow-100 text-yellow-700"
                      : task.status === "En proceso"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {task.status}
                </span>
              </td>

              <td>
                {task.dueDate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
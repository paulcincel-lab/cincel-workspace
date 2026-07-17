import Link from "next/link";
import { projects } from "@/lib/data/projects";

export default function ProjectsTable() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">

      <div className="p-6 border-b border-slate-200 flex justify-between items-center">

        <div>
          <h2 className="text-2xl font-bold">
            Proyectos
          </h2>

          <p className="text-slate-500 mt-1">
            Todos los proyectos activos de Cincel
          </p>
        </div>

        <button className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700">
          + Nuevo Proyecto
        </button>

      </div>

      <table className="w-full">

        <thead className="bg-slate-50">

          <tr className="text-left text-sm text-slate-600">

            <th className="p-4">Código</th>
            <th>Proyecto</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Fase</th>
            <th>Responsable</th>
            <th>Avance</th>

          </tr>

        </thead>

        <tbody>

          {projects.map((project) => (

            <tr
              key={project.id}
              className="border-t border-slate-100 hover:bg-slate-50"
            >

              <td className="p-4 font-medium">
                {project.code}
              </td>

              <td className="font-semibold text-blue-600">

                <Link href={`/proyectos/${project.id}`}>
                  {project.name}
                </Link>

              </td>

              <td>
                {project.client.name}
              </td>

              <td>
                {project.type}
              </td>

              <td>
                {project.phase}
              </td>

              <td>
                {project.manager}
              </td>

              <td className="w-56">

                <div className="flex items-center gap-3">

                  <div className="w-full h-2 bg-slate-200 rounded-full">

                    <div
                      className="h-2 bg-blue-600 rounded-full"
                      style={{
                        width: `${project.progress}%`,
                      }}
                    />

                  </div>

                  <span className="text-sm font-medium w-12">
                    {project.progress}%
                  </span>

                </div>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}
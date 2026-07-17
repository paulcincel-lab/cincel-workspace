import Link from "next/link";

type Props = {
  project: {
    id: number;
    name: string;
    client: {
      name: string;
    };
    manager: string;
    phase: string;
    progress: number;
    status: string;
  };
};

export default function ProjectCard({ project }: Props) {
  return (
    <Link href={`/proyectos/${project.id}`}>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-lg transition">

        <div className="flex justify-between">

          <h3 className="text-xl font-bold">
            {project.name}
          </h3>

          <span
            className={`rounded-full px-3 py-1 text-sm ${
              project.status === "Activo"
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {project.status}
          </span>

        </div>

        <p className="text-slate-500 mt-2">
          {project.client.name}
        </p>

        <div className="mt-6">

          <div className="flex justify-between text-sm">

            <span>{project.phase}</span>

            <span>{project.progress}%</span>

          </div>

          <div className="mt-2 h-2 rounded-full bg-slate-200">

            <div
              className="h-2 rounded-full bg-blue-600"
              style={{
                width: `${project.progress}%`,
              }}
            />

          </div>

        </div>

      </div>

    </Link>
  );
}
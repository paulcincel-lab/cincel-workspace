const projects = [
  {
    name: "Ensenada",
    progress: 92,
  },
  {
    name: "NeoGen",
    progress: 65,
  },
  {
    name: "Platzi",
    progress: 38,
  },
  {
    name: "Muinura",
    progress: 81,
  },
];

export default function ProjectsOverview() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

      <h2 className="text-xl font-semibold text-slate-900 mb-6">
        Proyectos
      </h2>

      <div className="space-y-6">

        {projects.map((project) => (

          <div key={project.name}>

            <div className="flex justify-between text-sm mb-2">

              <span className="font-medium text-slate-700">
                {project.name}
              </span>

              <span className="text-slate-500">
                {project.progress}%
              </span>

            </div>

            <div className="h-2 rounded-full bg-slate-200">

              <div
                className="h-2 rounded-full bg-blue-600"
                style={{
                  width: `${project.progress}%`,
                }}
              />

            </div>

          </div>

        ))}

      </div>

    </section>
  );
}
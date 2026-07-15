export default function Sidebar() {
  const menu = [
    "Inicio",
    "Proyectos",
    "Tareas",
    "Equipo",
    "Construcción",
    "Calendario",
    "Reportes",
    "Configuración",
  ];

  return (
    <aside className="w-72 h-screen bg-slate-950 text-white flex flex-col">

      <div className="border-b border-slate-800 p-8">

        <h1 className="text-2xl font-bold">
          Cincel
        </h1>

        <p className="text-slate-400 text-sm">
          Workspace
        </p>

      </div>

      <nav className="flex-1 p-5">

        {menu.map((item, index) => (
          <button
            key={item}
            className={`w-full text-left px-4 py-3 rounded-xl mb-2 transition ${
              index === 0
                ? "bg-blue-600 text-white"
                : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            {item}
          </button>
        ))}

      </nav>

      <div className="border-t border-slate-800 p-6">

        <div className="text-sm text-slate-400">
          Cincel Workspace
        </div>

        <div className="font-semibold">
          v0.1
        </div>

      </div>

    </aside>
  );
}
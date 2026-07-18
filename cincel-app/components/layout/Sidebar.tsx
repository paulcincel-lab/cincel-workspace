"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const menu = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Proyectos", href: "/proyectos" },
    { label: "Actividades", href: "/tareas" },
    { label: "Equipo", href: "/equipo" },
    { label: "Recursos", href: "/recursos" },
    { label: "Clientes", href: "/clientes" },
    { label: "Configuración", href: "/configuracion" },
  ];

  return (
    <aside className="w-72 h-screen bg-slate-950 text-white flex flex-col">

      <div className="border-b border-slate-800 p-8">
        <h1 className="text-2xl font-bold">Cincel</h1>
        <p className="text-slate-400 text-sm">Workspace</p>
      </div>

      <nav className="flex-1 p-5 space-y-2">

        {menu.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                active
                  ? "bg-blue-600 font-semibold"
                  : "hover:bg-slate-800 text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

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
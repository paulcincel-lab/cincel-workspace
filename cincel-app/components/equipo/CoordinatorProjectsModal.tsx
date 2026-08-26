"use client";

import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

interface CoordinatorProjectsModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/** Overlay listing all projects where a team member acts as coordinator. */
export function CoordinatorProjectsModal({ member, onClose }: CoordinatorProjectsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Proyectos como Encargado</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-xl text-slate-400 hover:text-slate-700"
              aria-label="Cerrar"
            >
              x
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">{member.name}</p>
        </div>

        <div className="space-y-3 p-6">
          {member.coordinatorProjects.length === 0 ? (
            <p className="text-sm text-slate-500">No hay proyectos asignados como encargado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {member.coordinatorProjects.map((project) => (
                <span
                  key={`coordinator-project-${member.id}-${project}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
                >
                  {project}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

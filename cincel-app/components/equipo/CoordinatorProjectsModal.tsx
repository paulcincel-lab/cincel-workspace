"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

interface CoordinatorProjectsModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/** Overlay listing all projects where a team member acts as coordinator. */
export function CoordinatorProjectsModal({ member, onClose }: CoordinatorProjectsModalProps) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Proyectos como Encargado</DialogTitle>
          <DialogDescription>{member.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

interface CoordinatorProjectsModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/** Overlay listing all projects where a team member acts as coordinator. */
export function CoordinatorProjectsModal({ member, onClose }: CoordinatorProjectsModalProps) {
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Proyectos como Encargado</SheetTitle>
          <SheetDescription>{member.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-6 py-4">
          {member.coordinatorProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay proyectos asignados como encargado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {member.coordinatorProjects.map((project) => (
                <span
                  key={`coordinator-project-${member.id}-${project}`}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-foreground"
                >
                  {project}
                </span>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

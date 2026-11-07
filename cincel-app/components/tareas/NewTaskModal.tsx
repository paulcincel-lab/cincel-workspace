"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import type { ProjectSpaceRef, WorkflowPhaseRef } from "@/lib/types/core";

/** Select value for "Sin espacio" (Select items can't carry null). */
const NO_SPACE = "__none__";

export type NewTaskFormValues = {
  projectId: string;
  /** A fase of the tramo's catalog; null in admin mode. */
  phaseId: string | null;
  /** An espacio of the selected project, or null ("Sin espacio"). */
  spaceId: string | null;
  title: string;
  managerId: string | null;
  supportIds: string[];
  notes: string;
  commitmentDate: string;
  reviewDate: string;
};

type ProjectOption = { id: string; name: string };
type StaffOption = { id: string; name: string };

type Props = {
  open: boolean;
  /** "admin": "Nueva tarea de administración", no Fase and no Espacio. */
  mode?: "tramo" | "admin";
  projects: ProjectOption[];
  staff: StaffOption[];
  /** The tramo's active fase catalog, in catalog order. */
  phases?: WorkflowPhaseRef[];
  /** Espacios per project id; the Espacio select shows only when the selected project has some. */
  spacesByProject?: Record<string, ProjectSpaceRef[]>;
  onClose: () => void;
  onSave: (task: NewTaskFormValues) => void;
};

const NO_MANAGER = "__none__";

export default function NewTaskModal({
  open,
  mode = "tramo",
  projects,
  staff,
  phases = [],
  spacesByProject = {},
  onClose,
  onSave,
}: Props) {
  const isAdminMode = mode === "admin";
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [phaseId, setPhaseId] = useState<string | null>(phases[0]?.id ?? null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // Admin tasks may stay unassigned ("Sin responsable", RD-12).
  const [managerId, setManagerId] = useState<string | null>(isAdminMode ? null : (staff[0]?.id ?? null));
  const [supportNames, setSupportNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [commitmentDate, setCommitmentDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const commitmentDateRef = useRef<HTMLInputElement>(null);
  const reviewDateRef = useRef<HTMLInputElement>(null);

  const staffNames = staff.map((s) => s.name);
  const nameToId = new Map(staff.map((s) => [s.name, s.id]));
  const projectSpaces = spacesByProject[projectId] ?? [];
  // Fall back to the first fase when the catalog changes under the open modal.
  const selectedPhaseId = phaseId && phases.some((p) => p.id === phaseId) ? phaseId : (phases[0]?.id ?? null);
  const selectedSpaceId = spaceId && projectSpaces.some((s) => s.id === spaceId) ? spaceId : null;
  const missingPhase = !isAdminMode && !selectedPhaseId;

  const changeProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setSpaceId(null);
  };

  const handleSave = () => {
    const currentTitle = titleRef.current?.value ?? title;
    const trimmedTitle = currentTitle.trim();

    if (!trimmedTitle || !projectId || missingPhase) return;

    const nextValues: NewTaskFormValues = {
      projectId,
      phaseId: isAdminMode ? null : selectedPhaseId,
      spaceId: isAdminMode ? null : selectedSpaceId,
      title: trimmedTitle,
      managerId,
      supportIds: supportNames.map((n) => nameToId.get(n)).filter((id): id is string => Boolean(id)),
      notes: notesRef.current?.value ?? notes,
      commitmentDate: commitmentDateRef.current?.value ?? commitmentDate,
      reviewDate: reviewDateRef.current?.value ?? reviewDate,
    };

    onSave(nextValues);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[700px] max-w-[700px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {isAdminMode ? "Nueva tarea de administración" : "Nueva tarea"}
          </SheetTitle>
        </SheetHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
            {isAdminMode
              ? "Se creará en «Para administración». Solo los administradores la ven y solo se asigna a administradores."
              : "Se creará como tarea activa y aparecerá en el grupo del proyecto seleccionado."}
          </div>

          <div>
            <Label className="mb-2 block text-foreground">Descripción</Label>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe la tarea..."
              className="text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className="mb-2 block text-foreground">Proyecto</Label>
              {projects.length === 0 ? (
                <p className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  No hay proyectos activos disponibles
                </p>
              ) : (
                <Select
                  items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
                  value={projectId}
                  onValueChange={(v) => changeProject(v as string)}
                >
                  <SelectTrigger aria-label="Proyecto" className="w-full text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="mb-2 block text-foreground">Responsable</Label>
              <Select
                items={{
                  ...(isAdminMode ? { [NO_MANAGER]: "Sin responsable" } : {}),
                  ...Object.fromEntries(staff.map((s) => [s.id, s.name])),
                }}
                value={managerId ?? (isAdminMode ? NO_MANAGER : "")}
                onValueChange={(v) => {
                  const next = v as string;
                  setManagerId(next && next !== NO_MANAGER ? next : null);
                }}
              >
                <SelectTrigger aria-label="Responsable" className="w-full text-foreground">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  {isAdminMode ? <SelectItem value={NO_MANAGER}>Sin responsable</SelectItem> : null}
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="mb-2 block text-foreground">Equipo</Label>
              <TeamMultiSelect
                options={staffNames}
                selected={supportNames}
                onChange={setSupportNames}
              />
            </div>

            {isAdminMode ? null : (
              <div>
                <Label className="mb-2 block text-foreground">Fase</Label>
                {phases.length === 0 ? (
                  <p className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                    Este tramo no tiene fases activas
                  </p>
                ) : (
                  <Select
                    items={Object.fromEntries(phases.map((p) => [p.id, p.name]))}
                    value={selectedPhaseId ?? ""}
                    onValueChange={(v) => setPhaseId((v as string) || null)}
                  >
                    <SelectTrigger aria-label="Fase" className="w-full text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {phases.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {!isAdminMode && projectSpaces.length > 0 ? (
              <div>
                <Label className="mb-2 block text-foreground">Espacio</Label>
                <Select
                  items={{ [NO_SPACE]: "Sin espacio", ...Object.fromEntries(projectSpaces.map((sp) => [sp.id, sp.name])) }}
                  value={selectedSpaceId ?? NO_SPACE}
                  onValueChange={(v) => setSpaceId(v && v !== NO_SPACE ? (v as string) : null)}
                >
                  <SelectTrigger aria-label="Espacio" className="w-full text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SPACE}>Sin espacio</SelectItem>
                    {projectSpaces.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          {/* New tasks always start "pendiente" — UserTaskInput has no status field,
              so there is nothing to pick here; status is changed from the table
              afterwards. */}

          <div>
            <Label className="mb-2 block text-foreground">Historial</Label>
            <Textarea
              ref={notesRef}
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe el seguimiento inicial..."
              className="text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className="mb-2 block text-foreground">Fecha compromiso</Label>
              <Input ref={commitmentDateRef} type="date" value={commitmentDate} onChange={(e) => setCommitmentDate(e.target.value)} className="text-foreground" />
            </div>

            <div>
              <Label className="mb-2 block text-foreground">Próxima revisión</Label>
              <Input ref={reviewDateRef} type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className="text-foreground" />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} className="text-foreground">
            Cancelar
          </Button>

          <Button onClick={handleSave} disabled={!projectId || missingPhase}>
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

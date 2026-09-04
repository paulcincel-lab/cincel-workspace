"use client";

import { useRef, useState } from "react";
import type { TaskStatus } from "@/lib/types/task";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";

type TaskFormValues = {
  project: string;
  phase: string;
  description: string;
  manager: string;
  support: string[];
  status: TaskStatus;
  notes: string;
  commitmentDate: string;
  reviewDate: string;
};

type Props = {
  open: boolean;
  projects: string[];
  teamMembers: string[];
  phaseOptions: string[];
  onClose: () => void;
  onSave: (task: TaskFormValues) => void;
  /** Ref to the trigger element so focus returns on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
};

export default function NewTaskModal({
  open,
  projects,
  teamMembers,
  phaseOptions,
  onClose,
  onSave,
}: Props) {
  const [project, setProject] = useState(projects[0] ?? "Ensenada");
  const [phase, setPhase] = useState(phaseOptions[0] ?? "Inicial");
  const [description, setDescription] = useState("");
  const [manager, setManager] = useState(teamMembers[0] ?? "Sin responsable");
  const [support, setSupport] = useState<string[]>([]);
  const [status, setStatus] = useState<TaskStatus>("Pendiente");
  const [notes, setNotes] = useState("");
  const [commitmentDate, setCommitmentDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const descriptionRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const commitmentDateRef = useRef<HTMLInputElement>(null);
  const reviewDateRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const currentDescription = descriptionRef.current?.value ?? description;
    const trimmedDescription = currentDescription.trim();

    if (!trimmedDescription) return;

    const nextValues: TaskFormValues = {
      project,
      phase,
      description: trimmedDescription,
      manager,
      support,
      status,
      notes: notesRef.current?.value ?? notes,
      commitmentDate: commitmentDateRef.current?.value ?? commitmentDate,
      reviewDate: reviewDateRef.current?.value ?? reviewDate,
    };

    onSave(nextValues);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[700px] max-w-[700px] overflow-y-auto text-black">
        <SheetHeader>
          <SheetTitle className="text-black">Nueva tarea</SheetTitle>
        </SheetHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            Se creará como tarea activa y aparecerá en el grupo del proyecto seleccionado.
          </div>

          <div>
            <Label className="mb-2 block text-black">Descripción</Label>
            <Input
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe la tarea..."
              className="text-black placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className="mb-2 block text-black">Proyecto</Label>
              <Select value={project} onValueChange={(v) => setProject(v as string)}>
                <SelectTrigger className="w-full text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block text-black">Responsable</Label>
              <Select value={manager} onValueChange={(v) => setManager(v as string)}>
                <SelectTrigger className="w-full text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member} value={member}>
                      {member}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="mb-2 block text-black">Equipo</Label>
              <TeamMultiSelect
                options={teamMembers}
                selected={support}
                onChange={setSupport}
              />
            </div>

            <div>
              <Label className="mb-2 block text-black">Fase</Label>
              <Select
                value={phase}
                onValueChange={(selected) => {
                  if (selected === "Otro...") {
                    const customPhase = window.prompt("Nueva fase", "");
                    const trimmed = customPhase?.trim();

                    if (trimmed) {
                      setPhase(trimmed);
                    }

                    return;
                  }

                  setPhase(selected as string);
                }}
              >
                <SelectTrigger className="w-full text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...phaseOptions, "Otro..."].map((phaseOption) => (
                    <SelectItem key={phaseOption} value={phaseOption}>
                      {phaseOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block text-black">Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="w-full text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En proceso">En proceso</SelectItem>
                  <SelectItem value="Completado">Completado</SelectItem>
                  <SelectItem value="Bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-black">Seguimiento</Label>
            <Textarea
              ref={notesRef}
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe el seguimiento inicial..."
              className="text-black placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className="mb-2 block text-black">Fecha compromiso</Label>
              <Input ref={commitmentDateRef} type="date" value={commitmentDate} onChange={(e) => setCommitmentDate(e.target.value)} className="text-black" />
            </div>

            <div>
              <Label className="mb-2 block text-black">Próxima revisión</Label>
              <Input ref={reviewDateRef} type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className="text-black" />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} className="text-black">
            Cancelar
          </Button>

          <Button onClick={handleSave}>
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
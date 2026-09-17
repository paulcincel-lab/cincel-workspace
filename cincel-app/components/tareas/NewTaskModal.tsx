"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";

export type NewTaskFormValues = {
  projectId: string;
  phase: string;
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
  projects: ProjectOption[];
  staff: StaffOption[];
  phaseOptions: string[];
  onClose: () => void;
  onSave: (task: NewTaskFormValues) => void;
};

export default function NewTaskModal({
  open,
  projects,
  staff,
  phaseOptions,
  onClose,
  onSave,
}: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [phase, setPhase] = useState(phaseOptions[0] ?? "Inicial");
  const [title, setTitle] = useState("");
  const [managerId, setManagerId] = useState<string | null>(staff[0]?.id ?? null);
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

  const handleSave = () => {
    const currentTitle = titleRef.current?.value ?? title;
    const trimmedTitle = currentTitle.trim();

    if (!trimmedTitle || !projectId) return;

    const nextValues: NewTaskFormValues = {
      projectId,
      phase,
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
          <SheetTitle className="text-foreground">Nueva tarea</SheetTitle>
        </SheetHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
            Se creará como tarea activa y aparecerá en el grupo del proyecto seleccionado.
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
                <Select value={projectId} onValueChange={(v) => setProjectId(v as string)}>
                  <SelectTrigger className="w-full text-foreground">
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
                value={managerId ?? ""}
                onValueChange={(v) => setManagerId((v as string) || null)}
              >
                <SelectTrigger className="w-full text-foreground">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
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

            <div>
              <Label className="mb-2 block text-foreground">Fase</Label>
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
                <SelectTrigger className="w-full text-foreground">
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
          </div>
          {/* New tasks always start "pendiente" — UserTaskInput has no status field,
              so there is nothing to pick here; status is changed from the table
              afterwards. */}

          <div>
            <Label className="mb-2 block text-foreground">Seguimiento</Label>
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

          <Button onClick={handleSave} disabled={!projectId}>
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useRef, useState } from "react";
import type { TaskStatus } from "@/lib/types/task";
import DialogOverlay from "@/components/ui/DialogOverlay";
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
  triggerRef,
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
  const projectRef = useRef<HTMLSelectElement>(null);
  const phaseRef = useRef<HTMLSelectElement>(null);
  const managerRef = useRef<HTMLSelectElement>(null);
  const statusRef = useRef<HTMLSelectElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const commitmentDateRef = useRef<HTMLInputElement>(null);
  const reviewDateRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleSave = () => {
    const currentDescription = descriptionRef.current?.value ?? description;
    const trimmedDescription = currentDescription.trim();

    if (!trimmedDescription) return;

    const nextValues: TaskFormValues = {
      project: projectRef.current?.value ?? project,
      phase: phaseRef.current?.value ?? phase,
      description: trimmedDescription,
      manager: managerRef.current?.value ?? manager,
      support,
      status: (statusRef.current?.value as TaskStatus | undefined) ?? status,
      notes: notesRef.current?.value ?? notes,
      commitmentDate: commitmentDateRef.current?.value ?? commitmentDate,
      reviewDate: reviewDateRef.current?.value ?? reviewDate,
    };

    onSave(nextValues);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <DialogOverlay
        label="Nueva tarea"
        onClose={onClose}
        triggerRef={triggerRef}
        className="bg-white rounded-2xl w-[700px] shadow-xl text-black"
      >
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-black">Nueva tarea</h2>
            <button type="button" onClick={onClose} className="text-black hover:text-slate-700 text-xl">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            Se creará como tarea activa y aparecerá en el grupo del proyecto seleccionado.
          </div>

          <div>
            <label className="block mb-2 font-medium text-black">Descripción</label>
            <input
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe la tarea..."
              className="w-full border rounded-xl px-4 py-3 text-black placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block mb-2 font-medium text-black">Proyecto</label>
              <select ref={projectRef} value={project} onChange={(e) => setProject(e.target.value)} className="w-full border rounded-xl bg-white px-4 py-3 text-black">
                {projects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-2 font-medium text-black">Responsable</label>
              <select ref={managerRef} value={manager} onChange={(e) => setManager(e.target.value)} className="w-full border rounded-xl bg-white px-4 py-3 text-black">
                {teamMembers.map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="block mb-2 font-medium text-black">Equipo</label>
              <TeamMultiSelect
                options={teamMembers}
                selected={support}
                onChange={setSupport}
              />
            </div>

            <div>
              <label className="block mb-2 font-medium text-black">Fase</label>
              <select
                ref={phaseRef}
                value={phase}
                onChange={(e) => {
                  const selected = e.target.value;

                  if (selected === "Otro...") {
                    const customPhase = window.prompt("Nueva fase", "");
                    const trimmed = customPhase?.trim();

                    if (trimmed) {
                      setPhase(trimmed);
                    }

                    return;
                  }

                  setPhase(selected);
                }}
                className="w-full border rounded-xl bg-white px-4 py-3 text-black"
              >
                {[...phaseOptions, "Otro..."].map((phaseOption) => (
                  <option key={phaseOption} value={phaseOption}>
                    {phaseOption}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-2 font-medium text-black">Estado</label>
              <select ref={statusRef} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="w-full border rounded-xl bg-white px-4 py-3 text-black">
                <option>Pendiente</option>
                <option>En proceso</option>
                <option>Completado</option>
                <option>Bloqueado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block mb-2 font-medium text-black">Seguimiento</label>
            <textarea
              ref={notesRef}
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe el seguimiento inicial..."
              className="w-full border rounded-xl p-4 text-black placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block mb-2 font-medium text-black">Fecha compromiso</label>
              <input ref={commitmentDateRef} type="date" value={commitmentDate} onChange={(e) => setCommitmentDate(e.target.value)} className="w-full border rounded-xl bg-white px-4 py-3 text-black" />
            </div>

            <div>
              <label className="block mb-2 font-medium text-black">Próxima revisión</label>
              <input ref={reviewDateRef} type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className="w-full border rounded-xl bg-white px-4 py-3 text-black" />
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="border px-5 py-3 rounded-xl text-black hover:bg-slate-50">
            Cancelar
          </button>

          <button type="button" onClick={handleSave} className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700">
            Guardar
          </button>
        </div>
      </DialogOverlay>
    </div>
  );
}
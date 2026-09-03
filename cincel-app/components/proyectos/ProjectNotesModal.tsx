"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import type { ProjectNote } from "@/lib/proyectos/use-projects-data";

function formatDate(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return parsed.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ProjectNotesModalProps {
  projectName: string;
  notes: ProjectNote[];
  onClose: () => void;
  onSave: (content: string) => void;
}

/** Modal overlay for adding and reviewing per-project operational notes. */
export function ProjectNotesModal({ projectName, notes, onClose, onSave }: ProjectNotesModalProps) {
  const [noteDraft, setNoteDraft] = useState("");

  const handleSave = () => {
    const content = noteDraft.trim();
    if (!content) return;
    onSave(content);
    setNoteDraft("");
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Notas del proyecto</DialogTitle>
          <DialogDescription>{projectName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Escribe una nota operativa..."
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Guardar nota
            </button>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto border-t border-slate-200 pt-4">
            {notes.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Todavia no hay notas para este proyecto.
              </p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-800">{note.content}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(note.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";
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
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[672px] max-w-[672px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Notas del proyecto</SheetTitle>
          <SheetDescription>{projectName}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Escribe una nota operativa..."
            rows={4}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Guardar nota
            </Button>
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
      </SheetContent>
    </Sheet>
  );
}

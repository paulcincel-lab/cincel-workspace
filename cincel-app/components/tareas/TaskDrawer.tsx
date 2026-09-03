"use client";

import { useMemo, useState } from "react";

import type { Task } from "@/lib/types/task";
import { formatDateDMY } from "@/lib/utils/date";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";

type Props = {
  task: Task | null;
  teamMembers: string[];
  onClose: () => void;
  onSave: (task: Task) => void;
};

export default function TaskDrawer({ task, onClose, onSave }: Props) {
  const [newNote, setNewNote] = useState("");

  const sortedHistory = useMemo(() => {
    if (!task) {
      return [];
    }

    return [...task.history].sort((a, b) => {
      if (a.date === b.date) {
        return a.id - b.id;
      }

      return a.date.localeCompare(b.date);
    });
  }, [task]);

  const handleAddNote = () => {
    if (!task) {
      return;
    }

    const trimmed = newNote.trim();
    if (!trimmed) {
      return;
    }

    const noteDate = new Date().toISOString().slice(0, 10);

    onSave({
      ...task,
      notes: trimmed,
      history: [
        ...task.history,
        {
          id: Date.now(),
          date: noteDate,
          author: task.manager || "Tú",
          comment: trimmed,
        },
      ],
      updatedAt: "Hoy",
    });

    setNewNote("");
  };

  return (
    <Sheet open={task !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[560px] p-0">
        {task ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-800">
                    Detalle de tarea
                  </p>
                  <SheetTitle className="mt-2">{task.description}</SheetTitle>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-800">
                <span className="rounded-full bg-slate-100 px-3 py-1">{task.project}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{task.phase}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{task.status}</span>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section>
                <h3 className="text-lg font-semibold text-slate-900">Resumen</h3>
                <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-800">Responsable</span>
                    <span className="font-medium">{task.manager}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-800">Equipo</span>
                    <span className="font-medium text-right">{task.support.length > 0 ? task.support.join(", ") : "Sin apoyo"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-800">Compromiso</span>
                    <span className="font-medium">{formatDateDMY(task.commitmentDate)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-800">Próxima revisión</span>
                    <span className="font-medium">{formatDateDMY(task.reviewDate)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                    <span className="text-slate-800">Estado</span>
                    <span className="font-medium">{task.status}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-slate-900">Seguimiento</h3>
                <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 p-4">
                  {sortedHistory.length > 0 ? (
                    <div className="space-y-2">
                      {sortedHistory.map((item) => (
                        <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-800">
                            <span>{formatDateDMY(item.date)}</span>
                            <span>{item.author}</span>
                          </div>
                          <p className="mt-2">{item.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-800">No hay notas de seguimiento registradas.</p>
                  )}

                  <div className="space-y-2 rounded-xl border border-dashed border-slate-200 p-3">
                    <Textarea
                      value={newNote}
                      onChange={(event) => setNewNote(event.target.value)}
                      rows={3}
                      placeholder="Agregar nueva nota de seguimiento..."
                      className="text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddNote}
                        className="h-auto rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-900"
                      >
                        Guardar nota
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-slate-900">Checklist</h3>
                <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-800">Placeholder de checklist.</p>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-slate-900">Archivos</h3>
                <div className="mt-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-800">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span>Sin archivos adjuntos</span>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Próximamente</span>
                  </div>
                </div>
              </section>
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

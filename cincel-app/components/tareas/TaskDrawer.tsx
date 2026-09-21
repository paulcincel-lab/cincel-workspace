"use client";

import { useMemo, useState } from "react";

import type { StaffRef, TaskChecklistItem, TaskDetail } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";

const STATUS_LABEL: Record<TaskDetail["status"], string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

type Props = {
  open: boolean;
  task: TaskDetail | null;
  onClose: () => void;
  onAddComment: (comment: string) => void;
  onAddChecklistItem: (title: string) => void;
  onToggleChecklistItem: (item: TaskChecklistItem) => void;
  onRemoveChecklistItem: (item: TaskChecklistItem) => void;
  /** Reorders the checklist to the given id order (top to bottom). Optional so other callers can skip it. */
  onReorderChecklist?: (orderedIds: string[]) => void;
  /** Active staff available to assign as support. Optional — support editing is hidden when omitted. */
  staffOptions?: StaffRef[];
  onChangeSupport?: (staffIds: string[]) => void;
};

export default function TaskDrawer({
  open,
  task,
  onClose,
  onAddComment,
  onAddChecklistItem,
  onToggleChecklistItem,
  onRemoveChecklistItem,
  onReorderChecklist,
  staffOptions = [],
  onChangeSupport,
}: Props) {
  const [newNote, setNewNote] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const nameToStaffId = useMemo(() => new Map(staffOptions.map((s) => [s.name, s.id])), [staffOptions]);
  const staffNames = useMemo(() => staffOptions.map((s) => s.name), [staffOptions]);

  const sortedHistory = useMemo(() => {
    if (!task) return [];
    return [...task.history].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  }, [task]);

  const handleAddNote = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    onAddComment(trimmed);
    setNewNote("");
  };

  const handleAddChecklistItem = () => {
    const trimmed = newChecklistItem.trim();
    if (!trimmed) return;
    onAddChecklistItem(trimmed);
    setNewChecklistItem("");
  };

  const moveChecklistItem = (item: TaskChecklistItem, direction: "up" | "down") => {
    if (!task || !onReorderChecklist) return;
    const items = task.checklistItems;
    const index = items.findIndex((i) => i.id === item.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    onReorderChecklist(reordered.map((i) => i.id));
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[560px] p-0">
        {task ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Detalle de tarea
                  </p>
                  <SheetTitle className="mt-2">{task.title}</SheetTitle>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="rounded-full bg-muted px-3 py-1">{task.project.name}</span>
                {task.phase ? <span className="rounded-full bg-muted px-3 py-1">{task.phase}</span> : null}
                <span className="rounded-full bg-muted px-3 py-1">{STATUS_LABEL[task.status]}</span>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section>
                <h3 className="text-lg font-semibold text-foreground">Resumen</h3>
                <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Responsable</span>
                    <span className="font-medium">{task.manager?.name ?? "Sin responsable"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Equipo</span>
                    <span className="font-medium text-right">
                      {task.support.length > 0 ? task.support.map((s) => s.name).join(", ") : "Sin apoyo"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Compromiso</span>
                    <span className="font-medium">{formatDateDMY(task.commitmentDate ?? "")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Próxima revisión</span>
                    <span className="font-medium">{formatDateDMY(task.reviewDate ?? "")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-muted-foreground">Estado</span>
                    <span className="font-medium">{STATUS_LABEL[task.status]}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-foreground">Historial</h3>
                <div className="mt-3 space-y-3 rounded-2xl border border-border p-4">
                  {sortedHistory.length > 0 ? (
                    <div className="space-y-2">
                      {sortedHistory.map((item) => (
                        <div key={item.id} className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            <span>{formatDateDMY(item.eventAt.slice(0, 10))}</span>
                            <span>{item.actor?.name ?? "Sistema"}</span>
                          </div>
                          <p className="mt-2">
                            {item.kind === "comentario"
                              ? item.comment
                              : `Cambió ${item.field ?? "un campo"}: ${item.beforeValue ?? "—"} → ${item.afterValue ?? "—"}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay notas de seguimiento registradas.</p>
                  )}

                  <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
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
                        className="h-auto rounded-lg px-3 py-2 text-xs font-semibold"
                      >
                        Guardar nota
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-foreground">Checklist</h3>
                <div className="mt-3 space-y-2 rounded-2xl border border-border p-4">
                  {task.checklistItems.length > 0 ? (
                    task.checklistItems.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted">
                        {onReorderChecklist ? (
                          <div className="flex flex-col">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-5 p-0 text-xs text-muted-foreground disabled:opacity-30"
                              disabled={index === 0}
                              onClick={() => moveChecklistItem(item, "up")}
                              title="Mover arriba"
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-5 p-0 text-xs text-muted-foreground disabled:opacity-30"
                              disabled={index === task.checklistItems.length - 1}
                              onClick={() => moveChecklistItem(item, "down")}
                              title="Mover abajo"
                            >
                              ↓
                            </Button>
                          </div>
                        ) : null}
                        <label className="flex flex-1 items-center gap-3">
                          <Checkbox checked={item.completed} onCheckedChange={() => onToggleChecklistItem(item)} />
                          <span className={`flex-1 text-sm ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {item.title}
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveChecklistItem(item)}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin puntos de checklist.</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Input
                      value={newChecklistItem}
                      onChange={(event) => setNewChecklistItem(event.target.value)}
                      placeholder="Nuevo punto..."
                      className="h-8 text-sm"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddChecklistItem();
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" className="h-8" onClick={handleAddChecklistItem}>
                      Agregar
                    </Button>
                  </div>
                </div>
              </section>

              {onChangeSupport && staffOptions.length > 0 ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Staff de apoyo</h3>
                  <div className="mt-3 rounded-2xl border border-border p-4">
                    <TeamMultiSelect
                      options={staffNames}
                      selected={task.support.map((s) => s.name)}
                      onChange={(members) => {
                        const ids = members.map((n) => nameToStaffId.get(n)).filter((id): id is string => Boolean(id));
                        onChangeSupport(ids);
                      }}
                    />
                  </div>
                </section>
              ) : null}
              {/* Per-task attachments have no equivalent in the new schema (file links
                  now live only at the project level via ProjectLink) — dropped rather
                  than faked. */}
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </SheetFooter>
          </>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Cargando tarea...</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

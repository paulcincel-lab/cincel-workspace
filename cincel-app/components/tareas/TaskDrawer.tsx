"use client";

import { useMemo, useState } from "react";

import type { StaffRef, TaskChecklistItem, TaskDetail, TaskLinkInput } from "@/lib/types/core";
import { DriveLinksEditor } from "@/components/ui/DriveLinksEditor";
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

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = "image/*,.txt,text/plain";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  /** Uploads a file as a task comment (#425). Optional — the attach control is hidden when omitted. */
  onAddAttachment?: (file: File, checklistItemId?: string) => void;
  /** Adds an internal or client Drive/web link (#436). Optional — the links section is hidden when omitted. */
  onAddLink?: (input: TaskLinkInput) => void;
  onRemoveLink?: (linkId: string) => void;
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
  onAddAttachment,
  onAddLink,
  onRemoveLink,
  staffOptions = [],
  onChangeSupport,
}: Props) {
  const [newNote, setNewNote] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [attachmentError, setAttachmentError] = useState("");

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

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onAddAttachment) return;

    const isAllowedType = file.type.startsWith("image/") || file.type === "text/plain";
    if (!isAllowedType) {
      setAttachmentError("Solo se permiten imágenes o archivos .txt.");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setAttachmentError("El archivo supera el límite de 10MB.");
      return;
    }

    setAttachmentError("");
    onAddAttachment(file);
  };

  const handleChecklistPhotoChange = (item: TaskChecklistItem, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onAddAttachment) return;
    if (!file.type.startsWith("image/")) {
      setAttachmentError("Las fotos del checklist deben ser imágenes.");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setAttachmentError("El archivo supera el límite de 10MB.");
      return;
    }
    setAttachmentError("");
    onAddAttachment(file, item.id);
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
                <span className="rounded-full bg-muted px-3 py-1">{task.customStatus?.name ?? STATUS_LABEL[task.status]}</span>
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
                    <span className="font-medium">{task.customStatus?.name ?? STATUS_LABEL[task.status]}</span>
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
                    task.checklistItems.map((item, index) => {
                      const photos = task.attachments.filter((a) => a.checklistItemId === item.id);
                      return (
                        <div key={item.id} className="rounded-lg px-2 py-1.5 hover:bg-muted">
                          <div className="flex items-center gap-1">
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
                            {onAddAttachment ? (
                              <label
                                className="inline-flex h-6 cursor-pointer items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                                title="Adjuntar foto a este punto"
                              >
                                📷
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  aria-label={`Adjuntar foto a ${item.title}`}
                                  onChange={(e) => handleChecklistPhotoChange(item, e)}
                                />
                              </label>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => onRemoveChecklistItem(item)}
                            >
                              Quitar
                            </Button>
                          </div>
                          {photos.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                              {photos.map((photo) => {
                                const href = `/api/tareas/${task.id}/adjuntos/${photo.id}`;
                                return (
                                  <a key={photo.id} href={href} target="_blank" rel="noreferrer" title={photo.fileName}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded content */}
                                    <img src={href} alt={photo.fileName} className="h-12 w-12 rounded-md border border-border object-cover" />
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
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


              {onAddLink ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Enlaces de Drive</h3>
                  <div className="mt-3">
                    <DriveLinksEditor links={task.links} onAdd={onAddLink} onRemove={onRemoveLink} />
                  </div>
                </section>
              ) : null}

              {onAddAttachment ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Adjuntos</h3>
                  <div className="mt-3 space-y-3 rounded-2xl border border-border p-4">
                    {task.attachments.some((a) => !a.checklistItemId) ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {task.attachments.filter((a) => !a.checklistItemId).map((attachment) => {
                          const href = `/api/tareas/${task.id}/adjuntos/${attachment.id}`;
                          const isImage = attachment.mimeType.startsWith("image/");
                          return (
                            <a
                              key={attachment.id}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="group rounded-xl border border-border p-2 text-xs hover:border-primary"
                              title={attachment.fileName}
                            >
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded content, not an optimizable static asset
                                <img src={href} alt={attachment.fileName} className="h-20 w-full rounded-lg object-cover" />
                              ) : (
                                <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted text-2xl">📄</div>
                              )}
                              <p className="mt-1 truncate font-medium text-foreground group-hover:underline">{attachment.fileName}</p>
                              <p className="text-muted-foreground">{formatBytes(attachment.sizeBytes)}</p>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>
                    )}

                    <div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground">
                        + Adjuntar imagen o .txt (máx. 10MB)
                        <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleAttachmentChange} />
                      </label>
                      {attachmentError ? <p className="mt-2 text-xs text-destructive">{attachmentError}</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}
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

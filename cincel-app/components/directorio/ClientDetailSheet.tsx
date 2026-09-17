"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { fetchContactHistoryAction } from "@/lib/actions/contacts-actions";
import { formatDateDMY } from "@/lib/utils/date";
import type { ContactDetail, HistoryEvent, ProjectStatus } from "@/lib/types/core";

interface ClientDetailSheetProps {
  contact: ContactDetail;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

function formatCurrency(value: string): string {
  const num = Number(value);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);
}

/**
 * Read-only ficha for a `cliente` contact — general data, `client_stats`
 * (only populated server-side for cliente contacts) and its linked projects.
 * Editing/deleting delegates to the shared ContactEditorSheet/delete flow.
 */
export function ClientDetailSheet({
  contact,
  onClose,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: ClientDetailSheetProps) {
  const [history, setHistory] = useState<HistoryEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchContactHistoryAction(contact.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const sortedHistory = [...history].sort((a, b) => a.eventAt.localeCompare(b.eventAt));

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ficha del cliente</SheetTitle>
          <SheetDescription>{contact.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PersonAvatar name={contact.name} subtitle={contact.email ?? contact.phone ?? "Sin contacto"} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onEdit}
                disabled={!canEdit}
                title={canEdit ? "" : "No tienes permiso para editar clientes"}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={onDelete}
                disabled={!canDelete}
                title={canDelete ? "" : "No tienes permiso para eliminar clientes"}
              >
                Eliminar
              </Button>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Datos generales</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Empresa o Particular</p>
                <p className="mt-1 font-medium">{contact.kind === "empresa" ? "Empresa" : "Particular"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cómo llegaron a nosotros</p>
                <p className="mt-1 font-medium">{contact.acquisitionChannel || "Sin registro"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="mt-1 font-medium">{contact.phone || "Sin registro"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="mt-1 font-medium">{contact.email || "Sin registro"}</p>
              </div>
            </div>
            {contact.notes ? (
              <p className="mt-3 text-sm text-muted-foreground">{contact.notes}</p>
            ) : null}
          </section>

          {contact.stats ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Estadísticas de cliente</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground"># proyectos totales</p>
                  <p className="mt-1 font-medium">{contact.stats.totalProjects}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proyectos activos</p>
                  <p className="mt-1 font-medium">{contact.stats.activeProjects}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fecha de primer trabajo</p>
                  <p className="mt-1 font-medium">{contact.stats.firstWorkDate || "Sin fecha"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total contratado</p>
                  <p className="mt-1 font-medium">{formatCurrency(contact.stats.totalContractedMxn)}</p>
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-3 text-sm font-semibold">Contactos adicionales</h3>
            {contact.people.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {contact.people.map((person) => (
                  <div key={person.id} className="rounded-xl border border-border bg-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{person.name}</p>
                      {person.isPrimary ? <Badge variant="outline">Principal</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{person.role || "Sin rol"}</p>
                    <p className="mt-1 text-sm">{person.phone || "Sin contacto"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{person.email || "Sin correo"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No hay otros contactos registrados para este cliente.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Proyectos</h3>
            {contact.projects.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {contact.projects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-border bg-muted p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.startDate || "Sin fecha de inicio"}</p>
                      </div>
                      <Badge variant={project.status === "activo" ? "outline" : "secondary"}>
                        {PROJECT_STATUS_LABEL[project.status]}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Link
                        href={`/proyectos/${project.id}/ficha`}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Ficha de proyecto
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Este cliente no tiene proyectos registrados.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Bitácora de cambios</h3>
            {sortedHistory.length > 0 ? (
              <div className="space-y-2">
                {sortedHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
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
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No hay cambios registrados para este cliente.
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

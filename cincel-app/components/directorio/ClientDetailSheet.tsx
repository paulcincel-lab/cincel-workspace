"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { ManualClient } from "@/lib/repositories/clients-repository";
import type { ClientHistoryEntry } from "@/lib/repositories/client-history-repository";
import type { ProjectItem } from "@/lib/proyectos/use-projects-data";
import { departamentoSlugForStage } from "@/lib/actividades/departamento";

interface ClientDetailSheetProps {
  client: ManualClient;
  linkedProjects: ProjectItem[];
  historyEntries: ClientHistoryEntry[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Read-only Cliente ficha — editing/deleting delegates to the shared ContactEditorSheet/delete flow. */
export function ClientDetailSheet({
  client,
  linkedProjects,
  historyEntries,
  onClose,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: ClientDetailSheetProps) {
  const completedProjects =
    client.completedProjects.length > 0 ? client.completedProjects : linkedProjects.map((p) => p.name);

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ficha del cliente</SheetTitle>
          <SheetDescription>{client.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PersonAvatar name={client.name} subtitle={client.emails[0] ?? client.phone ?? "Sin contacto"} />
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
                <p className="mt-1 font-medium">{client.kind}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proyecto activo</p>
                <p className="mt-1">
                  <Badge variant={client.hasActiveProject ? "outline" : "secondary"}>
                    {client.hasActiveProject ? "Sí" : "No"}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground"># proyectos con nosotros</p>
                <p className="mt-1 font-medium">{Math.max(client.totalProjectsWorked, linkedProjects.length)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fecha de primer trabajo</p>
                <p className="mt-1 font-medium">{client.firstWorkDate || "Sin fecha"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cómo llegaron a nosotros</p>
                <p className="mt-1 font-medium">{client.acquisitionChannel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Montos gastados</p>
                <p className="mt-1 font-medium">{formatCurrency(client.totalSpent)}</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Contactos adicionales</h3>
            {client.contacts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {client.contacts.map((contact, index) => (
                  <div key={index} className="rounded-xl border border-border bg-muted p-3">
                    <p className="font-medium">{contact.name || "Sin nombre"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contact.role || "Sin rol"}</p>
                    <p className="mt-1 text-sm">{contact.phone || "Sin contacto"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{contact.email || "Sin correo"}</p>
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
            <h3 className="mb-3 text-sm font-semibold">Proyectos realizados con nosotros</h3>
            {completedProjects.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {completedProjects.map((name, index) => (
                  <span key={index} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No hay proyectos históricos registrados para este cliente.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Proyectos vinculados</h3>
            {linkedProjects.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {linkedProjects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-border bg-muted p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.type} · {project.stage}</p>
                      </div>
                      <Badge variant={project.active ? "outline" : "secondary"}>
                        {project.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/proyectos/${project.id}/ficha`}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Ficha de proyecto
                      </Link>
                      <Link
                        href={`/actividades/${departamentoSlugForStage(project.stage)}?project=${encodeURIComponent(project.name)}`}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Ver actividades
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Este cliente no tiene proyectos operativos vinculados.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Bitácora de cambios</h3>
            {historyEntries.length > 0 ? (
              <div className="space-y-2">
                {historyEntries.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border bg-muted p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{entry.field}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.date).toLocaleString("es-MX")}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.before || "Vacío"} {"->"} {entry.after || "Vacío"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Por: {entry.author}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Todavía no hay cambios registrados para este cliente.
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

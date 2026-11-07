"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import type { ContactListItem, ProjectInput, Staff } from "@/lib/types/core";

const PROJECT_TYPE_OPTIONS = ["Habitacional", "Oficinas", "Comercial", "Mobiliario", "Mantenimiento", "Otro"];
const NO_VALUE = "__none__";

interface ProjectCreateModalProps {
  onClose: () => void;
  onConfirm: (input: ProjectInput) => Promise<void>;
}

/** Friendly copy for the defensive checks projects-repository.ts also runs server-side. */
function friendlyCreateError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "PROJECT_CLIENT_REQUIRED") return "Selecciona un cliente.";
    if (err.message === "NAME_TAKEN") return "Ya existe un proyecto con ese nombre.";
  }
  return "No se pudo crear el proyecto. Intenta de nuevo.";
}

/**
 * Modal for creating a new project. The client is still required here; the
 * first tramo (Presale) starts on its own when it is set to auto-start.
 */
export function ProjectCreateModal({ onClose, onConfirm }: ProjectCreateModalProps) {
  const [clients, setClients] = useState<ContactListItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState(PROJECT_TYPE_OPTIONS[0]);
  const [managerId, setManagerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchContactsAction({ type: "cliente" }).then(setClients);
    void fetchStaffAction().then(setStaff);
  }, []);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre del proyecto es obligatorio.");
      return;
    }
    if (!clientId) {
      setError("Selecciona un cliente.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm({
        name: trimmedName,
        clientId,
        projectType: type,
        managerId: managerId || null,
        startDate: startDate || null,
      });
    } catch (err) {
      setError(friendlyCreateError(err));
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Nuevo proyecto</SheetTitle>
          <SheetDescription>Crea un proyecto operativo y abre su ficha.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField className="sm:col-span-2">
              <Label className="block text-sm font-normal text-muted-foreground">Nombre del proyecto</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" />
            </FormField>

            <FormField>
              <Label className="block text-sm font-normal text-muted-foreground">Cliente</Label>
              <Select
                items={{
                  [NO_VALUE]: clients.length === 0 ? "No hay clientes" : "Selecciona un cliente",
                  ...Object.fromEntries(
                    clients.map((client) => [
                      client.id,
                      `${client.name} (${client.kind === "empresa" ? "Empresa" : "Particular"})`,
                    ])
                  ),
                }}
                value={clientId || NO_VALUE}
                onValueChange={(value) => setClientId(value === NO_VALUE ? "" : (value as string))}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE} disabled>
                    {clients.length === 0 ? "No hay clientes" : "Selecciona un cliente"}
                  </SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} ({client.kind === "empresa" ? "Empresa" : "Particular"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField>
              <Label className="block text-sm font-normal text-muted-foreground">Tipo de proyecto</Label>
              <Select
                items={Object.fromEntries(PROJECT_TYPE_OPTIONS.map((t) => [t, t]))}
                value={type}
                onValueChange={(value) => setType(value as string)}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField>
              <Label className="block text-sm font-normal text-muted-foreground">Encargado</Label>
              <Select
                items={{ [NO_VALUE]: "Sin encargado", ...Object.fromEntries(staff.map((s) => [s.id, s.name])) }}
                value={managerId || NO_VALUE}
                onValueChange={(value) => setManagerId(value === NO_VALUE ? "" : (value as string))}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Sin encargado</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField className="sm:col-span-2">
              <Label className="block text-sm font-normal text-muted-foreground">Fecha de inicio</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1"
              />
            </FormField>
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Creando..." : "Crear proyecto"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

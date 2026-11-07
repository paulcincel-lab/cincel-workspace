"use client";

import { useId, useState, type FormEvent } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import type { ProjectCreateInput } from "@/lib/types/core";

interface ProjectCreateModalProps {
  onClose: () => void;
  onConfirm: (input: ProjectCreateInput) => Promise<void>;
  /** Presale starts on its own when a project is created (first tramo set to `on_create`). */
  presaleAutoStart: boolean;
}

const EMPTY_NAME = "El nombre del proyecto es obligatorio.";

/** Spanish copy for the codes `createProjectAction` throws. */
export function friendlyCreateError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("NAME_TAKEN")) return "Ya existe un proyecto con ese nombre.";
  if (message.startsWith("EMPTY")) return EMPTY_NAME;
  if (message.startsWith("FORBIDDEN")) return "No tienes permiso para crear proyectos.";
  return "No se pudo crear el proyecto. Intenta de nuevo.";
}

/**
 * Sheet for creating a project. A project starts with its name only: client,
 * tipo, encargado and fechas are edited later in the ficha.
 */
export function ProjectCreateModal({ onClose, onConfirm, presaleAutoStart }: ProjectCreateModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(EMPTY_NAME);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm({ name: trimmedName });
    } catch (err) {
      setError(friendlyCreateError(err));
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
          <SheetHeader>
            <SheetTitle className="text-lg">Nuevo proyecto</SheetTitle>
            <SheetDescription>
              {presaleAutoStart
                ? "Solo necesitas el nombre. Presale se inicia automáticamente."
                : "Solo necesitas el nombre."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 px-6 py-4">
            <FormField>
              <Label className="block text-sm font-normal text-muted-foreground">Nombre del proyecto</Label>
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError("");
                }}
                className="mt-1"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error ? (
                <p id={errorId} className="mt-1 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </FormField>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear proyecto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useId, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import type { ProjectCreateInput } from "@/lib/types/core";

interface ProjectCreateModalProps {
  onClose: () => void;
  onConfirm: (input: ProjectCreateInput) => Promise<void>;
  /** Presale starts by itself on create (its auto-start is `on_create`). */
  presaleAutoStart: boolean;
}

const NAME_REQUIRED = "El nombre del proyecto es obligatorio.";

/** Friendly copy for the codes `createProjectAction` throws. */
export function friendlyCreateError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.startsWith("NAME_TAKEN")) return "Ya existe un proyecto con ese nombre.";
    if (err.message.startsWith("EMPTY")) return NAME_REQUIRED;
  }
  return "No se pudo crear el proyecto. Intenta de nuevo.";
}

/**
 * Sheet for creating a new project. A project starts with only its name;
 * client, tipo, encargado and fechas are edited later in the ficha, and the
 * first tramo is started from Actividades (or automatically for Presale).
 */
export function ProjectCreateModal({ onClose, onConfirm, presaleAutoStart }: ProjectCreateModalProps) {
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(NAME_REQUIRED);
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
        <SheetHeader>
          <SheetTitle className="text-lg">Nuevo proyecto</SheetTitle>
          <SheetDescription>
            {presaleAutoStart
              ? "Solo necesitas el nombre. Presale se inicia automáticamente."
              : "Solo necesitas el nombre."}
          </SheetDescription>
        </SheetHeader>

        <form
          className="space-y-4 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <FormField>
            <Label className="block text-sm font-normal text-muted-foreground">
              Nombre del proyecto
            </Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p id={errorId} className="mt-1 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </FormField>
        </form>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving}>
            {saving ? "Creando…" : "Crear proyecto"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

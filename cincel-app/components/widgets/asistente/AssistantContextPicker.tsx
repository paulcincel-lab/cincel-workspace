"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { catalogProjectOptionsOptions } from "@/lib/query/options/catalog";
import type { ContextChip } from "@/lib/types/asistente";

/** Modules a message can be about (the module chip sets `context.route`). */
export const ASSISTANT_CONTEXT_MODULES: readonly { route: string; label: string }[] = [
  { route: "/tareas", label: "Tareas" },
  { route: "/proyectos", label: "Proyectos" },
  { route: "/personas", label: "Personas" },
  { route: "/mi-espacio", label: "Mi espacio" },
];

/** The module label of a route, or null for one the picker doesn't offer. */
export function contextModuleLabel(route: string | undefined): string | null {
  if (!route) return null;
  return ASSISTANT_CONTEXT_MODULES.find((m) => route === m.route || route.startsWith(`${m.route}/`))?.label ?? null;
}

export type AssistantContextPickerProps = {
  onPick(chip: ContextChip): void;
};

/**
 * "Agregar contexto" in the Visual composer: a `Command` list of the
 * viewer's projects (the catalog projects query, read when opened) and the
 * modules. Picking one adds its chip.
 */
export function AssistantContextPicker({ onPick }: AssistantContextPickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const projects = useQuery({ ...catalogProjectOptionsOptions(), enabled: open });

  const pick = (chip: ContextChip) => {
    setOpen(false);
    onPick(chip);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <PlusIcon aria-hidden className="size-3" />
        Agregar contexto
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-0" aria-label="Agregar contexto">
        <Command>
          <CommandInput placeholder="Buscar proyecto o módulo" aria-label="Buscar proyecto o módulo" />
          <CommandList>
            <CommandEmpty>{projects.isPending ? "Cargando…" : "Sin resultados"}</CommandEmpty>
            {projects.data && projects.data.length > 0 ? (
              <CommandGroup heading="Proyectos">
                {projects.data.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={`${project.name} ${project.id}`}
                    onSelect={() => pick({ kind: "project", id: project.id, label: project.name })}
                  >
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Módulos">
              {ASSISTANT_CONTEXT_MODULES.map((module) => (
                <CommandItem
                  key={module.route}
                  value={`módulo ${module.label}`}
                  onSelect={() => pick({ kind: "module", id: module.route, label: module.label })}
                >
                  {module.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

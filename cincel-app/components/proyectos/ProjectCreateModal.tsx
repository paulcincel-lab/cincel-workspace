"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import type { ProjectItem } from "@/lib/proyectos/use-projects-data";

const STAGE_OPTIONS = ["Presale", "Diseño", "Construcción"];
/** shadcn Select (base-ui) doesn't support an empty-string item value. */
const NO_CLIENT_VALUE = "__none__";

type NewProjectDraft = {
  name: string;
  clientId: string;
  type: string;
  stages: string[];
  coordinator: string;
  docsUrl: string;
  startDate: string;
};

const emptyDraft: NewProjectDraft = {
  name: "",
  clientId: "",
  type: "Habitacional",
  stages: ["Presale"],
  coordinator: "Sin responsable",
  docsUrl: "",
  startDate: "",
};

type ActiveClientOption = {
  id: number;
  name: string;
  kind: "Empresa" | "Particular";
};

interface ProjectCreateModalProps {
  activeClientOptions: ActiveClientOption[];
  activeTeamNames: string[];
  projectTypeOptions: string[];
  existingProjectIds: number[];
  existingClientIds: number[];
  onClose: () => void;
  onConfirm: (project: ProjectItem) => void;
}

/** Modal for creating a new project and navigating to its ficha. */
export function ProjectCreateModal({
  activeClientOptions,
  activeTeamNames,
  projectTypeOptions,
  existingProjectIds,
  existingClientIds,
  onClose,
  onConfirm,
}: ProjectCreateModalProps) {
  const [draft, setDraft] = useState<NewProjectDraft>(() => ({
    ...emptyDraft,
    type: projectTypeOptions[0] ?? "Habitacional",
    coordinator: activeTeamNames[0] ?? "Sin responsable",
  }));
  const [createError, setCreateError] = useState("");

  const handleCreate = () => {
    const projectName = draft.name.trim();
    const selectedClient = activeClientOptions.find((client) => String(client.id) === draft.clientId);

    const nextProjectId = Math.max(0, ...existingProjectIds) + 1;
    const nextClientId = Math.max(0, ...existingClientIds) + 1;
    const safeProjectName = projectName || `Proyecto ${nextProjectId}`;
    const stageLabel = draft.stages.length > 0 ? draft.stages.join(" / ") : "Sin etapa";

    const createdProject: ProjectItem = {
      id: nextProjectId,
      code: `PRJ-${String(nextProjectId).padStart(3, "0")}`,
      name: safeProjectName,
      active: true,
      status: "Activo",
      client: {
        id: selectedClient?.id ?? nextClientId,
        name: selectedClient?.name ?? "Sin cliente vinculado",
        emails: [],
        phone: "",
        kind: selectedClient?.kind ?? "Particular",
        contacts: [],
        completedProjects: [],
        acquisitionChannel: "Sin registro",
        totalSpent: 0,
      },
      type: draft.type || "Otro",
      stage: stageLabel,
      phase: "Inicial",
      address: { street: "", city: "", state: "" },
      manager: "Sin responsable",
      coordinator: draft.coordinator || "Sin responsable",
      team: [],
      progress: 0,
      drive: {
        administrativo: draft.docsUrl.trim(),
        planos: "",
        renders: "",
        reportes: "",
      },
      startDate: draft.startDate || new Date().toISOString().split("T")[0],
    };

    setCreateError("");
    onConfirm(createdProject);
  };

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Nuevo proyecto</SheetTitle>
          <SheetDescription>Crea un proyecto operativo y abre su ficha.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="text-sm font-normal text-slate-700">
              Nombre del proyecto
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1"
              />
            </Label>

            <Label className="text-sm font-normal text-slate-700">
              Cliente (activos existentes)
              <Select
                value={draft.clientId || NO_CLIENT_VALUE}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, clientId: value === NO_CLIENT_VALUE ? "" : (value as string) }))
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT_VALUE}>
                    {activeClientOptions.length === 0 ? "No hay clientes activos" : "Vincular mas adelante"}
                  </SelectItem>
                  {activeClientOptions.map((client) => (
                    <SelectItem key={`active-client-${client.id}`} value={String(client.id)}>
                      {client.name} ({client.kind})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Label className="text-sm font-normal text-slate-700">
              Tipo de proyecto
              <Select value={draft.type} onValueChange={(value) => setDraft((prev) => ({ ...prev, type: value as string }))}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Label className="text-sm font-normal text-slate-700">
              Etapas (seleccion multiple)
              <div className="mt-1 grid gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                {STAGE_OPTIONS.map((stage) => (
                  <Label key={`stage-${stage}`} className="flex items-center gap-2 text-sm font-normal text-slate-700">
                    <Checkbox
                      checked={draft.stages.includes(stage)}
                      onCheckedChange={(checked) => {
                        setDraft((prev) => {
                          const hasStage = prev.stages.includes(stage);
                          if (checked && !hasStage) return { ...prev, stages: [...prev.stages, stage] };
                          if (!checked && hasStage) return { ...prev, stages: prev.stages.filter((item) => item !== stage) };
                          return prev;
                        });
                      }}
                    />
                    {stage}
                  </Label>
                ))}
              </div>
            </Label>

            <Label className="text-sm font-normal text-slate-700">
              Encargado
              <Select
                value={draft.coordinator}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, coordinator: value as string }))}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sin responsable">Sin encargado</SelectItem>
                  {activeTeamNames.map((name) => (
                    <SelectItem key={`new-coordinator-${name}`} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>

            <Label className="text-sm font-normal text-slate-700 sm:col-span-2">
              Vinculo Google Doc del proyecto
              <Input
                value={draft.docsUrl}
                onChange={(event) => setDraft((prev) => ({ ...prev, docsUrl: event.target.value }))}
                placeholder="https://docs.google.com/..."
                className="mt-1"
              />
            </Label>

            <Label className="text-sm font-normal text-slate-700 sm:col-span-2">
              Fecha de inicio
              <Input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                className="mt-1"
              />
            </Label>
          </div>

          {createError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
          ) : null}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate}>
            Crear proyecto
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

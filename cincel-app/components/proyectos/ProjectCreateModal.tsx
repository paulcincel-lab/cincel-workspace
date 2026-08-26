"use client";

import { useState } from "react";
import type { ProjectItem } from "@/lib/proyectos/use-projects-data";

const STAGE_OPTIONS = ["Presale", "Diseño", "Construcción"];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h4 className="text-lg font-bold text-slate-900">Nuevo proyecto</h4>
            <p className="text-sm text-slate-600">Crea un proyecto operativo y abre su ficha.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              Nombre del proyecto
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="text-sm text-slate-700">
              Cliente (activos existentes)
              <select
                value={draft.clientId}
                onChange={(event) => setDraft((prev) => ({ ...prev, clientId: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Vincular mas adelante</option>
                {activeClientOptions.length === 0 ? <option value="">No hay clientes activos</option> : null}
                {activeClientOptions.map((client) => (
                  <option key={`active-client-${client.id}`} value={String(client.id)}>
                    {client.name} ({client.kind})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Tipo de proyecto
              <select
                value={draft.type}
                onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {projectTypeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Etapas (seleccion multiple)
              <div className="mt-1 grid gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                {STAGE_OPTIONS.map((stage) => (
                  <label key={`stage-${stage}`} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.stages.includes(stage)}
                      onChange={(event) => {
                        setDraft((prev) => {
                          const hasStage = prev.stages.includes(stage);
                          if (event.target.checked && !hasStage) return { ...prev, stages: [...prev.stages, stage] };
                          if (!event.target.checked && hasStage) return { ...prev, stages: prev.stages.filter((item) => item !== stage) };
                          return prev;
                        });
                      }}
                    />
                    {stage}
                  </label>
                ))}
              </div>
            </label>

            <label className="text-sm text-slate-700">
              Encargado
              <select
                value={draft.coordinator}
                onChange={(event) => setDraft((prev) => ({ ...prev, coordinator: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="Sin responsable">Sin encargado</option>
                {activeTeamNames.map((name) => (
                  <option key={`new-coordinator-${name}`} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700 sm:col-span-2">
              Vinculo Google Doc del proyecto
              <input
                value={draft.docsUrl}
                onChange={(event) => setDraft((prev) => ({ ...prev, docsUrl: event.target.value }))}
                placeholder="https://docs.google.com/..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="text-sm text-slate-700 sm:col-span-2">
              Fecha de inicio
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          {createError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Crear proyecto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

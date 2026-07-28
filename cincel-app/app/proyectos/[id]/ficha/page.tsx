"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";

type ProjectItem = (typeof projects)[number];
type ActiveClientOption = {
  id: number;
  name: string;
  kind: "Empresa" | "Particular";
};

const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";
const MANUAL_CLIENTS_STORAGE_KEY = "cincel.clients.manual.v1";
const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";

function loadPersistedProjects(): ProjectItem[] {
  if (typeof window === "undefined") {
    return projects;
  }

  const stored = readStorage(PROJECTS_STORAGE_KEY);

  if (!stored) {
    return projects;
  }

  try {
    const parsed = JSON.parse(stored) as ProjectItem[];
    return Array.isArray(parsed) ? parsed : projects;
  } catch {
    return projects;
  }
}

function loadActiveClients(projectsData: ProjectItem[]): ActiveClientOption[] {
  const fromProjects: ActiveClientOption[] = projectsData
    .map((project) => {
      const kind: "Empresa" | "Particular" = project.client.kind === "Empresa" ? "Empresa" : "Particular";
      const option: ActiveClientOption = {
        id: project.client.id,
        name: project.client.name,
        kind,
      };
      return option;
    });

  if (typeof window === "undefined") {
    return fromProjects;
  }

  const stored = readStorage(MANUAL_CLIENTS_STORAGE_KEY);
  let fromManual: ActiveClientOption[] = [];

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Array<{
        id?: unknown;
        name?: unknown;
        kind?: unknown;
        hasActiveProject?: unknown;
      }>;

      if (Array.isArray(parsed)) {
        fromManual = parsed
          .map((item) => {
            const id = typeof item.id === "number" ? item.id : Number(item.id);
            const name = typeof item.name === "string" ? item.name.trim() : "";

            if (!Number.isFinite(id) || !name) {
              return null;
            }

            return {
              id,
              name,
              kind: item.kind === "Empresa" ? "Empresa" : "Particular",
            };
          })
          .filter((item): item is ActiveClientOption => item !== null);
      }
    } catch {
      fromManual = [];
    }
  }

  const deduped = new Map<string, ActiveClientOption>();

  for (const client of [...fromProjects, ...fromManual]) {
    const key = client.name.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, client);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function loadActiveTeamNames(): string[] {
  if (typeof window === "undefined") {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }

  const stored = readStorage(TEAM_MEMBERS_STORAGE_KEY);

  if (!stored) {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }

  try {
    const parsed = JSON.parse(stored) as Array<{ name?: unknown; active?: boolean }>;

    if (!Array.isArray(parsed)) {
      return teamMembers.filter((member) => member.active).map((member) => member.name);
    }

    return parsed
      .filter((member) => member.active)
      .map((member) => (typeof member.name === "string" ? member.name.trim() : ""))
      .filter(Boolean);
  } catch {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = readStorage(SECONDARY_COORDINATOR_STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const PROJECT_TYPES = ["Habitacional", "Oficinas", "Comercial", "Mobiliario", "Mantenimiento", "Otro"];
const STAGE_OPTIONS_FICHA = ["Presale", "Diseño", "Construcción"];

type EditDraft = {
  clientName: string;
  type: string;
  stages: string[];
  phase: string;
  street: string;
  city: string;
  addrState: string;
  startDate: string;
  coordinator: string;
  constructionCoordinator: string;
  driveAdministrativo: string;
  driveReportes: string;
};

function buildEditDraft(project: ProjectItem, constructionCoordinator: string): EditDraft {
  return {
    clientName: project.client.name,
    type: project.type,
    stages: project.stage.split("/").map((s) => s.trim()).filter(Boolean),
    phase: project.phase,
    street: project.address.street || "",
    city: project.address.city,
    addrState: project.address.state,
    startDate: project.startDate || "",
    coordinator: project.coordinator || "",
    constructionCoordinator,
    driveAdministrativo: project.drive?.administrativo || "",
    driveReportes: project.drive?.reportes || "",
  };
}

export default function ProjectFichaPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = Number(params.id);

  const [projectsData, setProjectsData] = useState<ProjectItem[]>(() => loadPersistedProjects());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [inlineEditingCoordinator, setInlineEditingCoordinator] = useState(false);
  const [inlineEditingConstructionCoordinator, setInlineEditingConstructionCoordinator] = useState(false);
  const [inlineEditingAddress, setInlineEditingAddress] = useState(false);
  const [inlineAddressValue, setInlineAddressValue] = useState<{ street: string; city: string; state: string }>({ street: "", city: "", state: "" });

  useEffect(() => {
    writeStorage(PROJECTS_STORAGE_KEY, JSON.stringify(projectsData));
  }, [projectsData]);

  useEffect(() => {
    writeStorage(SECONDARY_COORDINATOR_STORAGE_KEY, JSON.stringify(secondaryCoordinatorByProject));
  }, [secondaryCoordinatorByProject]);

  useEffect(() => {
    const refreshTeam = () => {
      setActiveTeamNames(loadActiveTeamNames());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    window.addEventListener("focus", refreshTeam);
    window.addEventListener("storage", refreshTeam);

    return () => {
      window.removeEventListener("focus", refreshTeam);
      window.removeEventListener("storage", refreshTeam);
    };
  }, []);

  const projectsCapabilities = useMemo(() => {
    return resolveProjectsCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const project = projectsData.find((item) => item.id === projectId) ?? null;
  const activeClients = useMemo(() => loadActiveClients(projectsData), [projectsData]);
  const constructionCoordinator = project ? secondaryCoordinatorByProject[project.id] || "Sin encargado" : "Sin encargado";
  const shouldAutoEditDocs = searchParams.get("edit") === "docs";

  useEffect(() => {
    if (!project || !shouldAutoEditDocs || isEditing || !projectsCapabilities.canEditProjectGeneral) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEditDraft(buildEditDraft(project, constructionCoordinator));
      setIsEditing(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [constructionCoordinator, isEditing, project, projectsCapabilities.canEditProjectGeneral, shouldAutoEditDocs]);

  if (!project) {
    return (
      <main className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <section className="flex-1 overflow-y-auto p-10">
          <Header />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Proyecto no encontrado</h1>
            <p className="mt-2 text-sm text-slate-600">No existe un proyecto con este identificador.</p>
            <Link href="/proyectos" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver a proyectos
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const projectActivities = [
    { label: "Presale", tasks: loadLinkedTasks("Presale", presaleTasks) },
    { label: "Diseño", tasks: loadLinkedTasks("Diseño", disenoTasks) },
    { label: "Construcción", tasks: loadLinkedTasks("Construcción", operativasTasks) },
  ].filter((activity) => activity.tasks.some((task) => task.project === project.name));

  const internalDocsUrl = project.drive?.administrativo ?? "";
  const clientDocsUrl = project.drive?.reportes ?? "";

  const startEditing = () => {
    if (!projectsCapabilities.canEditProjectGeneral) {
      return;
    }

    setEditDraft(buildEditDraft(project, constructionCoordinator));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditDraft(null);
  };

  const saveEditing = () => {
    if (!editDraft) return;

    const selectedClient = activeClients.find((c) => c.name === editDraft.clientName);

    setProjectsData((current) =>
      current.map((item) => {
        if (item.id !== project.id) return item;
        return {
          ...item,
          type: editDraft.type,
          stage: projectsCapabilities.canChangeProjectStage ? editDraft.stages.join(" / ") : item.stage,
          phase: editDraft.phase,
          startDate: editDraft.startDate,
          coordinator: editDraft.coordinator,
          client: projectsCapabilities.canEditProtectedProjectData && selectedClient
            ? { ...item.client, id: selectedClient.id, name: selectedClient.name, kind: selectedClient.kind }
            : item.client,
          address: {
            ...item.address,
            street: editDraft.street,
            city: editDraft.city,
            state: editDraft.addrState,
          },
          drive: {
            ...item.drive,
            administrativo: editDraft.driveAdministrativo,
            reportes: editDraft.driveReportes,
          },
        };
      })
    );

    setSecondaryCoordinatorByProject((current) => ({
      ...current,
      [project.id]: editDraft.constructionCoordinator,
    }));

    setIsEditing(false);
    setEditDraft(null);
  };

  const d = editDraft;

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          {/* Encabezado */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">Ficha del proyecto</h1>
                <p className="mt-1 text-slate-600">{project.name}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={saveEditing}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Guardar cambios
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/proyectos"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cerrar
                    </Link>
                    <button
                      type="button"
                      onClick={startEditing}
                      disabled={!projectsCapabilities.canEditProjectGeneral}
                      title={projectsCapabilities.canEditProjectGeneral ? "" : "No tienes permiso para editar información general"}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Editar ficha
                    </button>
                    <Link
                      href={`/tareas?project=${encodeURIComponent(project.name)}`}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Ver actividades
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
                <p className="text-xs text-slate-500">Actividades donde participa</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {projectActivities.length === 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                      Sin actividades
                    </span>
                  ) : (
                    projectActivities.map((activity) => (
                      <span key={`${project.id}-${activity.label}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {activity.label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Google Drive */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs text-slate-500">Documentos en Google Drive</p>
                {isEditing && d ? (
                  <div className="mt-2 space-y-3">
                    <label className="block text-xs text-slate-500">
                      Link — Documentos internos
                      <input
                        type="url"
                        value={d.driveAdministrativo}
                        onChange={(e) => setEditDraft({ ...d, driveAdministrativo: e.target.value })}
                        placeholder="https://drive.google.com/..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      Link — Documentos vista cliente
                      <input
                        type="url"
                        value={d.driveReportes}
                        onChange={(e) => setEditDraft({ ...d, driveReportes: e.target.value })}
                        placeholder="https://drive.google.com/..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {internalDocsUrl ? (
                      <a href={internalDocsUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        Documentos internos
                      </a>
                    ) : (
                      <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400">
                        Documentos internos
                      </span>
                    )}
                    {clientDocsUrl ? (
                      <a href={clientDocsUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        Documentos vista cliente
                      </a>
                    ) : (
                      <span className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400">
                        Documentos vista cliente
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Datos generales */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">Datos generales</h2>

              {isEditing && d ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    Cliente
                    <select
                      value={d.clientName}
                      onChange={(e) => setEditDraft({ ...d, clientName: e.target.value })}
                      disabled={!projectsCapabilities.canEditProtectedProjectData}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {activeClients.map((c) => (
                        <option key={`ficha-client-${c.id}`} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-700">
                    Tipo
                    <select
                      value={d.type}
                      onChange={(e) => setEditDraft({ ...d, type: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-2">
                    Etapas
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                      {STAGE_OPTIONS_FICHA.map((stage) => (
                        <label key={`stage-${stage}`} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={d.stages.includes(stage)}
                            disabled={!projectsCapabilities.canChangeProjectStage}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditDraft({ ...d, stages: [...d.stages, stage] });
                              } else {
                                setEditDraft({ ...d, stages: d.stages.filter((s) => s !== stage) });
                              }
                            }}
                          />
                          {stage}
                        </label>
                      ))}
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">
                    Fase
                    <input
                      type="text"
                      value={d.phase}
                      onChange={(e) => setEditDraft({ ...d, phase: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Fecha de inicio
                    <input
                      type="date"
                      value={d.startDate}
                      onChange={(e) => setEditDraft({ ...d, startDate: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Calle
                    <input
                      type="text"
                      value={d.street}
                      onChange={(e) => setEditDraft({ ...d, street: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Ciudad
                    <input
                      type="text"
                      value={d.city}
                      onChange={(e) => setEditDraft({ ...d, city: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-2">
                    Estado
                    <input
                      type="text"
                      value={d.addrState}
                      onChange={(e) => setEditDraft({ ...d, addrState: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Cliente</p>
                    <Link href={`/clientes/${project.client.id}`} className="mt-1 font-medium text-blue-600 hover:underline">
                      {project.client.name}
                    </Link>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Tipo</p>
                    <p className="mt-1 font-medium text-slate-800">{project.type}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Etapas</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {project.stage
                        .split("/")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((stage) => (
                          <span key={stage} className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {stage}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Fase</p>
                    <p className="mt-1 font-medium text-slate-800">{project.phase}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Fecha de inicio</p>
                    <p className="mt-1 font-medium text-slate-800">{project.startDate || "Sin fecha"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <p className="text-xs text-slate-500">Dirección</p>
                    {inlineEditingAddress ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={inlineAddressValue.street}
                          onChange={(e) => setInlineAddressValue({ ...inlineAddressValue, street: e.target.value })}
                          placeholder="Calle"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={inlineAddressValue.city}
                          onChange={(e) => setInlineAddressValue({ ...inlineAddressValue, city: e.target.value })}
                          placeholder="Ciudad"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={inlineAddressValue.state}
                          onChange={(e) => setInlineAddressValue({ ...inlineAddressValue, state: e.target.value })}
                          placeholder="Estado"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!projectsCapabilities.canEditProjectGeneral) {
                                return;
                              }

                              setProjectsData((current) =>
                                current.map((item) =>
                                  item.id === project.id
                                    ? {
                                        ...item,
                                        address: {
                                          ...item.address,
                                          street: inlineAddressValue.street,
                                          city: inlineAddressValue.city,
                                          state: inlineAddressValue.state,
                                        },
                                      }
                                    : item
                                )
                              );
                              setInlineEditingAddress(false);
                            }}
                            className="flex-1 rounded-lg border border-blue-500 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setInlineEditingAddress(false)}
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`mt-1 font-medium text-slate-800 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer hover:text-blue-600" : ""}`} onClick={() => {
                        if (!projectsCapabilities.canEditProjectGeneral) {
                          return;
                        }

                        setInlineAddressValue({
                          street: project.address.street || "",
                          city: project.address.city,
                          state: project.address.state,
                        });
                        setInlineEditingAddress(true);
                      }}>
                        {project.address.street ? `${project.address.street}, ` : ""}
                        {project.address.city}, {project.address.state}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Equipo asignado */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Equipo asignado</h2>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs text-slate-500">Líder de diseño</p>
                  {isEditing && d ? (
                    <select
                      value={d.coordinator}
                      onChange={(e) => setEditDraft({ ...d, coordinator: e.target.value })}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="">Sin encargado</option>
                      {activeTeamNames.map((member) => (
                        <option key={`coordinator-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : inlineEditingCoordinator ? (
                    <select
                      value={project.coordinator || ""}
                      onChange={(e) => {
                        if (!projectsCapabilities.canEditProjectGeneral) {
                          return;
                        }

                        setProjectsData((current) =>
                          current.map((item) =>
                            item.id === project.id ? { ...item, coordinator: e.target.value } : item
                          )
                        );
                        setInlineEditingCoordinator(false);
                      }}
                      onBlur={() => setInlineEditingCoordinator(false)}
                      autoFocus
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Sin encargado</option>
                      {activeTeamNames.map((member) => (
                        <option key={`coordinator-inline-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={`mt-2 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer" : ""}`} onClick={() => {
                      if (!projectsCapabilities.canEditProjectGeneral) {
                        return;
                      }

                      setInlineEditingCoordinator(true);
                    }}>
                      <Avatar name={project.coordinator || "Sin encargado"} />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Líder de construcción</p>
                  {isEditing && d ? (
                    <select
                      value={d.constructionCoordinator}
                      onChange={(e) => setEditDraft({ ...d, constructionCoordinator: e.target.value })}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="Sin encargado">Sin encargado</option>
                      {activeTeamNames.map((member) => (
                        <option key={`construction-coordinator-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : inlineEditingConstructionCoordinator ? (
                    <select
                      value={constructionCoordinator}
                      onChange={(e) => {
                        if (!projectsCapabilities.canEditProjectGeneral) {
                          return;
                        }

                        setSecondaryCoordinatorByProject((current) => ({
                          ...current,
                          [project.id]: e.target.value,
                        }));
                        setInlineEditingConstructionCoordinator(false);
                      }}
                      onBlur={() => setInlineEditingConstructionCoordinator(false)}
                      autoFocus
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Sin encargado">Sin encargado</option>
                      {activeTeamNames.map((member) => (
                        <option key={`construction-coordinator-inline-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={`mt-2 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer" : ""}`} onClick={() => {
                      if (!projectsCapabilities.canEditProjectGeneral) {
                        return;
                      }

                      setInlineEditingConstructionCoordinator(true);
                    }}>
                      <Avatar name={constructionCoordinator} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

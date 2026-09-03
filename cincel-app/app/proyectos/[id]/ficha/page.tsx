"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AppAvatar from "@/components/ui/AppAvatar";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { projects } from "@/lib/data/projects";
import { teamMembersPublic as teamMembers } from "@/lib/data/team-public";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { fetchProjects, saveProjects } from "@/lib/repositories/projects-repository";
import { fetchClients } from "@/lib/repositories/clients-repository";
import { fetchTeamMembersPublic } from "@/lib/repositories/team-repository";
import { fetchActivities } from "@/lib/repositories/activities-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { useDriveEnabled } from "@/lib/google/use-drive-enabled";
import type { Task } from "@/lib/types/task";

type ProjectItem = (typeof projects)[number];
type ActiveClientOption = {
  id: number;
  name: string;
  kind: "Empresa" | "Particular";
};
type ManualClientOption = ActiveClientOption;

const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";

/** Pre-hydration seed — real data comes from `fetchProjects()`. */
function loadPersistedProjects(): ProjectItem[] {
  return projects;
}

function loadActiveClients(
  projectsData: ProjectItem[],
  manualClients: ManualClientOption[] = []
): ActiveClientOption[] {
  const fromProjects: ActiveClientOption[] = projectsData.map((project) => ({
    id: project.client.id,
    name: project.client.name,
    kind: project.client.kind === "Empresa" ? "Empresa" : "Particular",
  }));

  const deduped = new Map<string, ActiveClientOption>();
  for (const client of [...fromProjects, ...manualClients]) {
    const key = client.name.toLowerCase();
    if (client.name && !deduped.has(key)) deduped.set(key, client);
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Pre-hydration seed — real names come from `fetchTeamMembersPublic()`. */
function loadActiveTeamNames(): string[] {
  return teamMembers.filter((member) => member.active).map((member) => member.name);
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
  const [manualClients, setManualClients] = useState<ManualClientOption[]>([]);
  const [tasksByWorkflow, setTasksByWorkflow] = useState<{ presale: Task[]; diseno: Task[]; construccion: Task[] }>(() => ({
    presale: loadLinkedTasks("Presale", presaleTasks),
    diseno: loadLinkedTasks("Diseño", disenoTasks),
    construccion: loadLinkedTasks("Construcción", operativasTasks),
  }));
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [drivePickerFor, setDrivePickerFor] = useState<
    "driveAdministrativo" | "driveReportes" | null
  >(null);
  const driveEnabled = useDriveEnabled();
  const [inlineEditingCoordinator, setInlineEditingCoordinator] = useState(false);
  const [inlineEditingConstructionCoordinator, setInlineEditingConstructionCoordinator] = useState(false);
  const [inlineEditingAddress, setInlineEditingAddress] = useState(false);
  const [inlineAddressValue, setInlineAddressValue] = useState<{ street: string; city: string; state: string }>({ street: "", city: "", state: "" });

  const lastSavedRef = useRef<ProjectItem[]>(projectsData);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced diffed save of project edits to Postgres.
  useEffect(() => {
    const changed = projectsData.filter((p) => {
      const saved = lastSavedRef.current.find((s) => s.id === p.id);
      return !saved || JSON.stringify(p) !== JSON.stringify(saved);
    });
    if (changed.length === 0) return;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = projectsData;
      saveProjects(changed).catch((err: unknown) => {
        if (err instanceof RepositoryError) reportRepositoryError(err);
      });
    }, 800);
    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, [projectsData]);

  useEffect(() => {
    writeStorage(SECONDARY_COORDINATOR_STORAGE_KEY, JSON.stringify(secondaryCoordinatorByProject));
  }, [secondaryCoordinatorByProject]);

  useEffect(() => {
    const refreshLocal = () => setAuthenticatedUser(getCurrentAuthenticatedUser());
    const hydrate = () => {
      void fetchProjects()
        .then((rows) => {
          if (rows.length > 0) {
            lastSavedRef.current = rows;
            setProjectsData(rows);
          }
        })
        .catch(() => undefined);
      void fetchClients()
        .then((rows) =>
          setManualClients(
            rows
              .filter((c) => c.hasActiveProject)
              .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
          )
        )
        .catch(() => undefined);
      void fetchTeamMembersPublic()
        .then((rows) => {
          const names = rows.filter((m) => m.active).map((m) => m.name).filter(Boolean);
          if (names.length > 0) setActiveTeamNames(names);
        })
        .catch(() => undefined);
      void Promise.all([
        fetchActivities("Presale"),
        fetchActivities("Diseño"),
        fetchActivities("Construcción"),
      ])
        .then(([p, d, c]) => {
          setTasksByWorkflow({
            presale: loadLinkedTasks("Presale", p.length > 0 ? p : presaleTasks),
            diseno: loadLinkedTasks("Diseño", d.length > 0 ? d : disenoTasks),
            construccion: loadLinkedTasks("Construcción", c.length > 0 ? c : operativasTasks),
          });
        })
        .catch(() => undefined);
    };

    refreshLocal();
    hydrate();

    const onExternalChange = () => {
      refreshLocal();
      hydrate();
    };
    window.addEventListener("focus", onExternalChange);
    window.addEventListener("storage", onExternalChange);

    return () => {
      window.removeEventListener("focus", onExternalChange);
      window.removeEventListener("storage", onExternalChange);
    };
  }, []);

  const projectsCapabilities = useMemo(() => {
    return resolveProjectsCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const project = projectsData.find((item) => item.id === projectId) ?? null;
  const activeClients = useMemo(
    () => loadActiveClients(projectsData, manualClients),
    [projectsData, manualClients]
  );
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
    { label: "Presale", tasks: tasksByWorkflow.presale },
    { label: "Diseño", tasks: tasksByWorkflow.diseno },
    { label: "Construcción", tasks: tasksByWorkflow.construccion },
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
                    <div className="block text-xs text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>Link — Documentos internos</span>
                        {driveEnabled ? (
                          <button
                            type="button"
                            onClick={() => setDrivePickerFor("driveAdministrativo")}
                            className="font-medium text-blue-700 hover:underline"
                          >
                            Elegir de Google Drive
                          </button>
                        ) : null}
                      </div>
                      <input
                        type="url"
                        value={d.driveAdministrativo}
                        onChange={(e) => setEditDraft({ ...d, driveAdministrativo: e.target.value })}
                        placeholder="https://drive.google.com/..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="block text-xs text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>Link — Documentos vista cliente</span>
                        {driveEnabled ? (
                          <button
                            type="button"
                            onClick={() => setDrivePickerFor("driveReportes")}
                            className="font-medium text-blue-700 hover:underline"
                          >
                            Elegir de Google Drive
                          </button>
                        ) : null}
                      </div>
                      <input
                        type="url"
                        value={d.driveReportes}
                        onChange={(e) => setEditDraft({ ...d, driveReportes: e.target.value })}
                        placeholder="https://drive.google.com/..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
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
                      <AppAvatar name={project.coordinator || "Sin encargado"} />
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
                      <AppAvatar name={constructionCoordinator} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <DrivePickerDialog
        open={drivePickerFor !== null}
        onClose={() => setDrivePickerFor(null)}
        onPick={(entry: DrivePickerEntry) => {
          const field = drivePickerFor;
          setDrivePickerFor(null);
          if (!field) return;
          setEditDraft((current) =>
            current ? { ...current, [field]: entry.webViewLink } : current
          );
        }}
      />
    </main>
  );
}

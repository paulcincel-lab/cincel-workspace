"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";

import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";

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

  const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);

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
  const fromProjects = projectsData
    .map((project) => ({
      id: project.client.id,
      name: project.client.name,
      kind: project.client.kind,
    }));

  if (typeof window === "undefined") {
    return fromProjects;
  }

  const stored = localStorage.getItem(MANUAL_CLIENTS_STORAGE_KEY);
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

  const stored = localStorage.getItem(TEAM_MEMBERS_STORAGE_KEY);

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

  const stored = localStorage.getItem(SECONDARY_COORDINATOR_STORAGE_KEY);

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

export default function ProjectFichaPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [projectsData, setProjectsData] = useState<ProjectItem[]>(() => loadPersistedProjects());
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [linkFeedback, setLinkFeedback] = useState("");

  useEffect(() => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projectsData));
  }, [projectsData]);

  useEffect(() => {
    localStorage.setItem(SECONDARY_COORDINATOR_STORAGE_KEY, JSON.stringify(secondaryCoordinatorByProject));
  }, [secondaryCoordinatorByProject]);

  useEffect(() => {
    const refreshTeam = () => setActiveTeamNames(loadActiveTeamNames());

    window.addEventListener("focus", refreshTeam);
    window.addEventListener("storage", refreshTeam);

    return () => {
      window.removeEventListener("focus", refreshTeam);
      window.removeEventListener("storage", refreshTeam);
    };
  }, []);

  const project = projectsData.find((item) => item.id === projectId) ?? null;
  const activeClients = useMemo(() => loadActiveClients(projectsData), [projectsData]);

  useEffect(() => {
    if (!project) {
      return;
    }

    const matching = activeClients.find((client) => client.name === project.client.name);
    setSelectedClientId(matching ? String(matching.id) : "");
  }, [project, activeClients]);

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

  const internalDocsUrl = project.drive.administrativo;
  const clientDocsUrl = project.drive.reportes;

  const hasLinkedClient = project.client.name !== "Sin cliente vinculado";
  const secondaryCoordinator = secondaryCoordinatorByProject[project.id] || "Sin encargado";

  const linkClient = () => {
    const selectedClient = activeClients.find((client) => String(client.id) === selectedClientId);

    if (!selectedClient) {
      setLinkFeedback("Selecciona un cliente para guardar el vinculo.");
      return;
    }

    setProjectsData((current) => current.map((item) => (
      item.id === project.id
        ? {
            ...item,
            client: {
              ...item.client,
              id: selectedClient.id,
              name: selectedClient.name,
              kind: selectedClient.kind,
            },
          }
        : item
    )));

    setLinkFeedback(`Cliente vinculado: ${selectedClient.name}`);
  };

  const updateSecondaryCoordinator = (value: string) => {
    setSecondaryCoordinatorByProject((current) => ({
      ...current,
      [project.id]: value,
    }));
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">Ficha del proyecto</h1>
                <p className="mt-1 text-slate-600">{project.name}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/proyectos"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </Link>
                {hasLinkedClient ? (
                  <Link
                    href={`/clientes/${project.client.id}`}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Agregar cliente
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400"
                  >
                    Agregar cliente
                  </button>
                )}
                <Link
                  href={`/tareas?project=${encodeURIComponent(project.name)}`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Ver actividades
                </Link>
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs text-slate-500">Documentos en Google Drive</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {internalDocsUrl ? (
                    <a
                      href={internalDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Documentos internos
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400"
                    >
                      Documentos internos
                    </button>
                  )}

                  {clientDocsUrl ? (
                    <a
                      href={clientDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Documentos vista cliente
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400"
                    >
                      Documentos vista cliente
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs text-slate-500">Vincular cliente</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className="min-w-[280px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">Seleccionar cliente</option>
                  {activeClients.map((client) => (
                    <option key={`project-ficha-client-${client.id}`} value={String(client.id)}>
                      {client.name} ({client.kind})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={linkClient}
                  disabled={!selectedClientId}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${selectedClientId ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
                >
                  Guardar vinculo
                </button>
              </div>
              {linkFeedback ? (
                <p className="mt-2 text-xs text-blue-700">{linkFeedback}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">Datos generales</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="mt-1 font-medium text-slate-800">{project.client.name}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Tipo</p>
                  <p className="mt-1 font-medium text-slate-800">{project.type}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Etapa</p>
                  <p className="mt-1 font-medium text-slate-800">{project.stage}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Fase</p>
                  <p className="mt-1 font-medium text-slate-800">{project.phase}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-xs text-slate-500">Dirección</p>
                  <p className="mt-1 font-medium text-slate-800">
                    {project.address.street ? `${project.address.street}, ` : ""}
                    {project.address.city}, {project.address.state}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Roles clave</h2>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs text-slate-500">Encargado cliente</p>
                  <div className="mt-2">
                    <Avatar name={project.coordinator || "Sin encargado"} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Encargado secundario</p>
                  <div className="mt-2 space-y-2">
                    <select
                      value={secondaryCoordinator}
                      onChange={(event) => updateSecondaryCoordinator(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="Sin encargado">Sin encargado</option>
                      {activeTeamNames.map((member) => (
                        <option key={`secondary-coordinator-${member}`} value={member}>{member}</option>
                      ))}
                    </select>
                    <Avatar name={secondaryCoordinator} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

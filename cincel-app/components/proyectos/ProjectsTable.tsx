"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";

type RiskLevel = "Alto" | "Medio" | "Bajo";

type ProjectNote = {
  id: string;
  projectId: number;
  content: string;
  createdAt: string;
};

type ProjectItem = (typeof projects)[number];

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function loadPersistedTasks(workflow: string, fallback: Task[]): Task[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storageKey = `cincel.actividades.${workflow}.tasks.v1`;
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    localStorage.removeItem(storageKey);
    return fallback;
  }
}

function riskBadgeClasses(risk: RiskLevel): string {
  if (risk === "Alto") return "bg-red-100 text-red-700 border-red-200";
  if (risk === "Medio") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function parseDate(input: string): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(input: string): string {
  const parsed = parseDate(input);
  if (!parsed) return "Sin fecha";
  return parsed.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function projectTasksPath(projectName: string): string {
  return `/tareas?project=${encodeURIComponent(projectName)}`;
}

function loadProjectNotes(): Record<number, ProjectNote[]> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = localStorage.getItem("cincel.projects.notes.v1");

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, ProjectNote[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem("cincel.projects.notes.v1");
    return {};
  }
}

function loadPersistedProjects(): ProjectItem[] {
  if (typeof window === "undefined") {
    return projects;
  }

  const stored = localStorage.getItem("cincel.projects.data.v1");

  if (!stored) {
    return projects;
  }

  try {
    const parsed = JSON.parse(stored) as Array<Partial<ProjectItem>>;

    if (!Array.isArray(parsed)) {
      return projects;
    }

    const normalized = parsed
      .map((item) => {
        const fallback = projects.find(
          (project) => project.code === item.code || project.name === item.name
        );

        if (!fallback) {
          return null;
        }

        const rawId = item.id;
        const numericId = typeof rawId === "number"
          ? rawId
          : typeof rawId === "string"
            ? Number(rawId)
            : Number.NaN;

        const safeId = Number.isFinite(numericId) ? numericId : fallback.id;
        const safeCoordinator = normalizeName(item.coordinator) || fallback.coordinator || "Sin responsable";

        return {
          ...fallback,
          ...item,
          id: safeId,
          coordinator: safeCoordinator,
        } as ProjectItem;
      })
      .filter((item): item is ProjectItem => item !== null);

    return normalized.length > 0 ? normalized : projects;
  } catch {
    localStorage.removeItem("cincel.projects.data.v1");
    return projects;
  }
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
      .map((member) => normalizeName(member.name))
      .filter((name): name is string => name !== null);
  } catch {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }
}

export default function ProjectsTable() {
  const [projectsData, setProjectsData] = useState<ProjectItem[]>(() => loadPersistedProjects());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Todas");
  const [managerFilter, setManagerFilter] = useState("Todos");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "Todos">("Todos");
  const [notesByProject, setNotesByProject] = useState<Record<number, ProjectNote[]>>(() => loadProjectNotes());
  const [activeNoteProjectId, setActiveNoteProjectId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    localStorage.setItem("cincel.projects.data.v1", JSON.stringify(projectsData));
  }, [projectsData]);

  useEffect(() => {
    const refreshTeam = () => setActiveTeamNames(loadActiveTeamNames());

    window.addEventListener("focus", refreshTeam);
    window.addEventListener("storage", refreshTeam);

    return () => {
      window.removeEventListener("focus", refreshTeam);
      window.removeEventListener("storage", refreshTeam);
    };
  }, []);

  const allTasks = useMemo(() => {
    return [
      ...loadPersistedTasks("Presale", presaleTasks),
      ...loadPersistedTasks("Diseño", disenoTasks),
      ...loadPersistedTasks("Construcción", operativasTasks),
    ];
  }, []);

  const enrichedProjects = useMemo(() => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    return projectsData.map((project) => {
      const projectTasks = allTasks.filter((task) => task.project === project.name && !task.archived);
      const activeTasks = projectTasks.filter((task) => task.status !== "Completado");
      const blockedCount = activeTasks.filter((task) => task.status === "Bloqueado").length;

      const dueDates = activeTasks
        .map((task) => task.commitmentDate)
        .filter(Boolean)
        .map((date) => parseDate(date))
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      const nextDelivery = dueDates.length > 0 ? dueDates[0] : null;
      const dueThisWeek = dueDates.filter((date) => date >= today && date <= nextWeek).length;
      const overdueCount = dueDates.filter((date) => date < today).length;

      const teamLoad = Math.min(
        100,
        Math.round((activeTasks.length / Math.max(project.team.length * 3, 1)) * 100)
      );

      const risk: RiskLevel = blockedCount > 0 || overdueCount > 0 || project.progress < 45
        ? "Alto"
        : dueThisWeek > 0 || project.progress < 75
          ? "Medio"
          : "Bajo";

      const mainAlert = blockedCount > 0
        ? `${blockedCount} tarea(s) bloqueada(s)`
        : overdueCount > 0
          ? `${overdueCount} entrega(s) vencida(s)`
          : dueThisWeek > 0
            ? `${dueThisWeek} entrega(s) esta semana`
            : "Sin alertas criticas";

      return {
        ...project,
        blockedCount,
        dueThisWeek,
        overdueCount,
        activeTaskCount: activeTasks.length,
        nextDelivery,
        teamLoad,
        risk,
        mainAlert,
      };
    });
  }, [allTasks, projectsData]);

  const stages = ["Todas", ...Array.from(new Set(projectsData.map((project) => project.stage)))];
  const managers = ["Todos", ...Array.from(new Set(projectsData.map((project) => project.manager)))];

  const filteredProjects = enrichedProjects.filter((project) => {
    const value = search.trim().toLowerCase();

    const matchesSearch = !value
      || project.name.toLowerCase().includes(value)
      || project.client.name.toLowerCase().includes(value)
      || project.code.toLowerCase().includes(value);

    const matchesStage = stageFilter === "Todas" || project.stage === stageFilter;
    const matchesManager = managerFilter === "Todos" || project.manager === managerFilter;
    const matchesRisk = riskFilter === "Todos" || project.risk === riskFilter;

    return matchesSearch && matchesStage && matchesManager && matchesRisk;
  });

  const kpiAtRisk = filteredProjects.filter((project) => project.risk === "Alto").length;
  const kpiOnTrack = filteredProjects.filter((project) => project.risk === "Bajo").length;
  const kpiBlocked = filteredProjects.reduce((acc, project) => acc + project.blockedCount, 0);
  const kpiDueThisWeek = filteredProjects.reduce((acc, project) => acc + project.dueThisWeek, 0);

  const alerts = filteredProjects
    .filter((project) => project.mainAlert !== "Sin alertas criticas")
    .slice(0, 6);

  const activeNoteProject = activeNoteProjectId === null
    ? null
    : projectsData.find((project) => project.id === activeNoteProjectId) ?? null;

  const activeNotes = activeNoteProjectId === null
    ? []
    : notesByProject[activeNoteProjectId] ?? [];

  const openNotesModal = (projectId: number) => {
    setActiveNoteProjectId(projectId);
    setNoteDraft("");
  };

  const closeNotesModal = () => {
    setActiveNoteProjectId(null);
    setNoteDraft("");
  };

  const saveNote = () => {
    const content = noteDraft.trim();

    if (!content || activeNoteProjectId === null) {
      return;
    }

    const newNote: ProjectNote = {
      id: `${activeNoteProjectId}-${Date.now()}`,
      projectId: activeNoteProjectId,
      content,
      createdAt: new Date().toISOString(),
    };

    const next = {
      ...notesByProject,
      [activeNoteProjectId]: [newNote, ...(notesByProject[activeNoteProjectId] ?? [])],
    };

    setNotesByProject(next);
    localStorage.setItem("cincel.projects.notes.v1", JSON.stringify(next));
    setNoteDraft("");
  };

  const updateCoordinator = (projectId: number, coordinator: string) => {
    setProjectsData((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              coordinator,
            }
          : project
      )
    );
  };

  const getCoordinatorOptions = (project: ProjectItem): string[] => {
    const options = [
      ...activeTeamNames.map((name) => normalizeName(name)),
      normalizeName(project.coordinator),
    ].filter((name): name is string => name !== null);

    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Proyectos</h2>
            <p className="mt-1 text-slate-600">Vista operativa para riesgo, entregas y carga por proyecto.</p>
          </div>

          <button className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Nuevo proyecto
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar proyecto, cliente o codigo..."
            className="w-72 rounded-xl border border-slate-200 px-4 py-2 text-sm"
          />

          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>

          <select
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            {managers.map((manager) => (
              <option key={manager} value={manager}>{manager}</option>
            ))}
          </select>

          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "Todos")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            <option value="Todos">Riesgo: todos</option>
            <option value="Alto">Riesgo alto</option>
            <option value="Medio">Riesgo medio</option>
            <option value="Bajo">Riesgo bajo</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-red-100 bg-red-50/70 p-4">
          <p className="text-sm text-slate-700">En riesgo</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{kpiAtRisk}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-sm text-slate-700">A tiempo</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{kpiOnTrack}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
          <p className="text-sm text-slate-700">Bloqueadas</p>
          <p className="mt-1 text-3xl font-bold text-amber-700">{kpiBlocked}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <p className="text-sm text-slate-700">Entregas semana</p>
          <p className="mt-1 text-3xl font-bold text-blue-700">{kpiDueThisWeek}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {filteredProjects.map((project) => (
            <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                  <h3 className="text-xl font-bold text-slate-900">{project.name}</h3>
                  <p className="text-sm text-slate-600">{project.client.name} · {project.stage}</p>
                </div>

                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClasses(project.risk)}`}>
                  Riesgo {project.risk}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">Encargado cliente</p>
                  <select
                    value={normalizeName(project.coordinator) || "Sin responsable"}
                    onChange={(event) => updateCoordinator(project.id, event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                    aria-label={`Encargado de ${project.name}`}
                  >
                    <option value="Sin responsable">Sin encargado</option>
                    {getCoordinatorOptions(project).map((member) => (
                      <option key={`card-coordinator-${project.id}-${member}`} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={projectTasksPath(project.name)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Ver tareas
                  </Link>
                  <Link href={`/proyectos/${project.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Abrir proyecto
                  </Link>
                  <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Abrir ficha del proyecto
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-500">Avance:</span> <span className="font-medium text-slate-700">{project.progress}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Proxima fecha:</span> <span className="font-medium text-slate-700">{project.nextDelivery ? formatDate(project.nextDelivery.toISOString()) : "Sin fecha"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Carga equipo:</span> <span className="font-medium text-slate-700">{project.teamLoad}%</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">Alerta principal: {project.mainAlert}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openNotesModal(project.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Registrar nota
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No hay proyectos con los filtros actuales.
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Atencion inmediata</h3>
          <p className="mt-1 text-sm text-slate-600">Proyectos que requieren accion hoy.</p>

          <div className="mt-4 space-y-3">
            {alerts.map((project) => (
              <div key={`alert-${project.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{project.name}</p>
                <p className="mt-1 text-xs text-slate-600">{project.mainAlert}</p>
              </div>
            ))}

            {alerts.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No hay alertas criticas por ahora.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Encargado</th>
              <th className="px-4 py-3">Carga equipo</th>
              <th className="px-4 py-3">Proxima entrega</th>
              <th className="px-4 py-3">Riesgo</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => (
              <tr key={`table-${project.id}`} className="border-b border-slate-100 text-sm text-slate-800 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-blue-700">
                  <Link href={`/proyectos/${project.id}`}>{project.name}</Link>
                </td>
                <td className="px-4 py-3">{project.client.name}</td>
                <td className="px-4 py-3">{project.stage}</td>
                <td className="px-4 py-3">{project.manager}</td>
                <td className="px-4 py-3">
                  <select
                    value={normalizeName(project.coordinator) || "Sin responsable"}
                    onChange={(event) => updateCoordinator(project.id, event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                    aria-label={`Encargado de ${project.name}`}
                  >
                    <option value="Sin responsable">Sin encargado</option>
                    {getCoordinatorOptions(project).map((member) => (
                      <option key={`table-coordinator-${project.id}-${member}`} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">{project.teamLoad}%</td>
                <td className="px-4 py-3">{project.nextDelivery ? formatDate(project.nextDelivery.toISOString()) : "Sin fecha"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskBadgeClasses(project.risk)}`}>
                    {project.risk}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/proyectos/${project.id}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      Abrir
                    </Link>
                    <Link href={projectTasksPath(project.name)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      Tareas
                    </Link>
                    <button
                      onClick={() => openNotesModal(project.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Nota
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeNoteProject ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Notas del proyecto</h4>
                <p className="text-sm text-slate-600">{activeNoteProject.name}</p>
              </div>
              <button
                onClick={closeNotesModal}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Escribe una nota operativa..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeNotesModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveNote}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Guardar nota
                </button>
              </div>

              <div className="max-h-72 space-y-3 overflow-y-auto border-t border-slate-200 pt-4">
                {activeNotes.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    Todavia no hay notas para este proyecto.
                  </p>
                ) : (
                  activeNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm text-slate-800">{note.content}</p>
                      <p className="mt-2 text-xs text-slate-500">{formatDate(note.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
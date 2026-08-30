"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import ExportMenu from "@/components/ui/ExportMenu";
import { DataTable } from "@/components/ui/DataTable";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { fetchClients } from "@/lib/repositories/clients-repository";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { useProjectsData, normalizeName, type ProjectItem } from "@/lib/proyectos/use-projects-data";
import { ProjectNotesModal } from "@/components/proyectos/ProjectNotesModal";
import { ProjectCreateModal } from "@/components/proyectos/ProjectCreateModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = "Alto" | "Medio" | "Bajo";

type ActiveClientOption = {
  id: number;
  name: string;
  kind: "Empresa" | "Particular";
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function projectStatusSelectClasses(active: boolean): string {
  return active
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
}

function projectStatusDotClasses(active: boolean): string {
  return active ? "bg-emerald-500" : "bg-red-500";
}

function parseDate(input: string): Date | null {
  if (!input) return null;
  const dateOnlyMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(input: string): string {
  const parsed = parseDate(input);
  if (!parsed) return "Sin fecha";
  return parsed.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function projectTasksPath(projectName: string): string {
  return `/tareas?project=${encodeURIComponent(projectName)}`;
}

function buildTimestampLabel(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `${date}-${time}`;
}

const PROJECT_TYPE_OPTIONS = ["Habitacional", "Oficinas", "Comercial", "Mobiliario", "Mantenimiento", "Otro"];

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectsTable({
  initialProjects,
}: {
  initialProjects?: ProjectItem[];
} = {}) {
  const router = useRouter();
  const {
    projectsData,
    isLoadingData,
    fetchError,
    activeTeamNames,
    authenticatedUser,
    secondaryCoordinatorByProject,
    setSecondaryCoordinatorByProject,
    notesByProject,
    allTasks,
    addProject,
    updateCoordinator,
    updateProjectActive,
    removeProject,
    addNote,
  } = useProjectsData(initialProjects);


  const [statusViewFilter, setStatusViewFilter] = useState<"Activos" | "Archivados">("Activos");
  const [search, setSearch] = useState("");
  const [coordinatorFilter, setCoordinatorFilter] = useState("Todos");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "Todos">("Todos");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeNoteProjectId, setActiveNoteProjectId] = useState<number | null>(null);
  const [inlineEditingCell, setInlineEditingCell] = useState<{ projectId: number; field: "design" | "construction" } | null>(null);

  const projectsCapabilities = useMemo(
    () => resolveProjectsCapabilities(authenticatedUser),
    [authenticatedUser]
  );

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

      return { ...project, blockedCount, dueThisWeek, overdueCount, activeTaskCount: activeTasks.length, nextDelivery, teamLoad, risk, mainAlert };
    });
  }, [allTasks, projectsData]);

  const coordinators = [
    "Todos",
    ...Array.from(new Set(projectsData.map((project) => normalizeName(project.coordinator) || "Sin encargado"))),
  ];

  const filteredProjects = enrichedProjects.filter((project) => {
    const value = search.trim().toLowerCase();
    const matchesSearch = !value || project.name.toLowerCase().includes(value);
    const projectCoordinator = normalizeName(project.coordinator) || "Sin encargado";
    const matchesCoordinator = coordinatorFilter === "Todos" || projectCoordinator === coordinatorFilter;
    const matchesRisk = riskFilter === "Todos" || project.risk === riskFilter;
    return matchesSearch && matchesCoordinator && matchesRisk;
  });

  const visibleProjects = filteredProjects.filter((project) =>
    statusViewFilter === "Activos" ? project.active : !project.active
  );

  const kpiActiveProjects = visibleProjects.filter((project) => project.active).length;

  const stageStats = visibleProjects.reduce<Record<string, number>>((acc, project) => {
    const stages = project.stage.split("/").map((s) => s.trim()).filter(Boolean);
    for (const stage of stages) acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  const orderedStageStats = Object.entries(stageStats).sort((a, b) => b[1] - a[1]);
  const totalStageAssignments = orderedStageStats.reduce((acc, [, count]) => acc + count, 0);

  const coordinatorStats = visibleProjects.reduce<Record<string, { design: number; construction: number; total: number }>>((acc, project) => {
    const designer = normalizeName(project.coordinator) || "Sin encargado";
    const constructor = normalizeName(secondaryCoordinatorByProject[project.id]) || "Sin encargado";
    if (!acc[designer]) acc[designer] = { design: 0, construction: 0, total: 0 };
    acc[designer].design += 1;
    acc[designer].total += 1;
    if (constructor !== designer) {
      if (!acc[constructor]) acc[constructor] = { design: 0, construction: 0, total: 0 };
      acc[constructor].construction += 1;
      acc[constructor].total += 1;
    } else {
      acc[designer].construction += 1;
    }
    return acc;
  }, {});

  const orderedCoordinatorStats = Object.entries(coordinatorStats).sort((a, b) => b[1].total - a[1].total);

  const alerts = visibleProjects.filter((project) => project.mainAlert !== "Sin alertas criticas").slice(0, 6);

  const projectsExportColumns = useMemo<Array<ExportColumn<(typeof visibleProjects)[number]>>>(() => [
    { key: "project", header: "Proyecto", getValue: (project) => project.name },
    { key: "client", header: "Cliente", getValue: (project) => project.client.name },
    { key: "stage", header: "Etapa", getValue: (project) => project.stage },
    { key: "designLeader", header: "Lider de diseño", getValue: (project) => normalizeName(project.coordinator) || "Sin encargado" },
    { key: "constructionLeader", header: "Lider de construcción", getValue: (project) => secondaryCoordinatorByProject[project.id] || "Sin encargado" },
    { key: "nextDelivery", header: "Proxima entrega", isDate: true, getValue: (project) => (project.nextDelivery ? project.nextDelivery : "") },
    { key: "status", header: "Estado", getValue: (project) => (project.active ? "Proyecto activo" : "Proyecto archivado") },
  ], [secondaryCoordinatorByProject]);

  const exportProjects = async (format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: "Proyectos",
      fileName: `proyectos-${statusViewFilter.toLowerCase()}-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: projectsExportColumns,
      rows: visibleProjects,
      landscape: true,
    });
  };

  const { data: manualClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });

  const activeClientOptions = useMemo<ActiveClientOption[]>(() => {
    const fromProjects: ActiveClientOption[] = projectsData
      .filter((project) => project.active)
      .map((project) => {
        const kind: "Empresa" | "Particular" = project.client.kind === "Empresa" ? "Empresa" : "Particular";
        return { id: project.client.id, name: project.client.name, kind };
      });

    const fromManual = manualClients
      .filter((item) => Boolean(item.hasActiveProject))
      .map((item) => ({ id: item.id, name: item.name, kind: item.kind as "Empresa" | "Particular" }));

    const deduped = new Map<string, ActiveClientOption>();
    for (const client of [...fromProjects, ...fromManual]) {
      const key = client.name.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, client);
    }
    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsData, manualClients]);

  const getCoordinatorOptions = (project: ProjectItem): string[] => {
    const options = [
      ...activeTeamNames.map((name) => normalizeName(name)),
      normalizeName(project.coordinator),
    ].filter((name): name is string => name !== null);
    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b));
  };

  const activeNoteProject = activeNoteProjectId === null
    ? null
    : projectsData.find((project) => project.id === activeNoteProjectId) ?? null;

  const activeNotes = activeNoteProjectId === null ? [] : notesByProject[activeNoteProjectId] ?? [];

  const openNotesModal = (projectId: number) => setActiveNoteProjectId(projectId);
  const closeNotesModal = () => setActiveNoteProjectId(null);

  const openCreateModal = () => {
    if (!projectsCapabilities.canCreateProject) return;
    setShowCreateModal(true);
  };

  const deleteProject = (projectId: number) => {
    if (!projectsCapabilities.canDeleteProject) return;
    const project = projectsData.find((item) => item.id === projectId);
    if (!project) return;
    const confirmed = window.confirm(
      `Se eliminara el proyecto "${project.name}". Esta accion no se puede deshacer. Deseas continuar?`
    );
    if (!confirmed) return;
    removeProject(projectId);
    if (activeNoteProjectId === projectId) closeNotesModal();
  };

  const clearFilters = () => {
    setSearch("");
    setCoordinatorFilter("Todos");
    setRiskFilter("Todos");
  };

  type EnrichedProject = (typeof enrichedProjects)[number];

  const projectColumns = useMemo<ColumnDef<EnrichedProject, unknown>[]>(
    () => [
      {
        id: "project",
        header: "Proyecto",
        accessorFn: (project) => project.name,
        cell: ({ row }) => (
          <span className="font-semibold text-blue-700">
            <Link href={projectTasksPath(row.original.name)}>{row.original.name}</Link>
          </span>
        ),
      },
      {
        id: "client",
        header: "Cliente",
        accessorFn: (project) => project.client.name,
      },
      {
        id: "stage",
        header: "Etapa",
        accessorFn: (project) => project.stage,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.stage
              .split("/")
              .map((stage) => stage.trim())
              .filter(Boolean)
              .map((stage) => (
                <span
                  key={`${row.original.id}-${stage}`}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                >
                  {stage}
                </span>
              ))}
          </div>
        ),
      },
      {
        id: "designLead",
        header: "Líder de diseño",
        accessorFn: (project) => normalizeName(project.coordinator) || "Sin encargado",
        cell: ({ row }) => {
          const project = row.original;
          return projectsCapabilities.canEditProjectGeneral &&
            inlineEditingCell?.projectId === project.id &&
            inlineEditingCell.field === "design" ? (
            <select
              value={normalizeName(project.coordinator) || "Sin encargado"}
              onChange={(event) => {
                updateCoordinator(project.id, event.target.value);
                setInlineEditingCell(null);
              }}
              onBlur={() => setInlineEditingCell(null)}
              autoFocus
              className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none"
            >
              <option value="Sin encargado">Sin encargado</option>
              {getCoordinatorOptions(project).map((member) => (
                <option key={`table-design-${project.id}-${member}`} value={member}>
                  {member}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`text-sm text-slate-800 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer hover:text-blue-600" : ""}`}
              onClick={() => {
                if (!projectsCapabilities.canEditProjectGeneral) return;
                setInlineEditingCell({ projectId: project.id, field: "design" });
              }}
            >
              {normalizeName(project.coordinator) || "Sin encargado"}
            </span>
          );
        },
      },
      {
        id: "constructionLead",
        header: "Líder de construcción",
        accessorFn: (project) => secondaryCoordinatorByProject[project.id] || "Sin encargado",
        cell: ({ row }) => {
          const project = row.original;
          return projectsCapabilities.canEditProjectGeneral &&
            inlineEditingCell?.projectId === project.id &&
            inlineEditingCell.field === "construction" ? (
            <select
              value={secondaryCoordinatorByProject[project.id] || "Sin encargado"}
              onChange={(event) => {
                setSecondaryCoordinatorByProject((current) => ({ ...current, [project.id]: event.target.value }));
                setInlineEditingCell(null);
              }}
              onBlur={() => setInlineEditingCell(null)}
              autoFocus
              className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none"
            >
              <option value="Sin encargado">Sin encargado</option>
              {getCoordinatorOptions(project).map((member) => (
                <option key={`table-construction-${project.id}-${member}`} value={member}>
                  {member}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`text-sm text-slate-800 ${projectsCapabilities.canEditProjectGeneral ? "cursor-pointer hover:text-blue-600" : ""}`}
              onClick={() => {
                if (!projectsCapabilities.canEditProjectGeneral) return;
                setInlineEditingCell({ projectId: project.id, field: "construction" });
              }}
            >
              {secondaryCoordinatorByProject[project.id] || "Sin encargado"}
            </span>
          );
        },
      },
      {
        id: "nextDelivery",
        header: "Proxima entrega",
        accessorFn: (project) => (project.nextDelivery ? project.nextDelivery.getTime() : Number.POSITIVE_INFINITY),
        cell: ({ row }) => (
          <span suppressHydrationWarning>
            {row.original.nextDelivery ? formatDate(row.original.nextDelivery.toISOString()) : "Sin fecha"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Estado",
        accessorFn: (project) => (project.active ? "activo" : "archivado"),
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${projectStatusDotClasses(project.active)}`} />
              <select
                value={project.active ? "activo" : "archivado"}
                onChange={(event) => updateProjectActive(project.id, event.target.value === "activo")}
                disabled={!projectsCapabilities.canArchiveProject}
                className={`rounded-lg border px-2 py-1 text-xs font-semibold ${projectStatusSelectClasses(project.active)}`}
                aria-label={`Estado en tabla de ${project.name}`}
              >
                <option value="activo">Proyecto activo</option>
                <option value="archivado">Proyecto archivado</option>
              </select>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Link
              href={`/proyectos/${row.original.id}/ficha`}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Ficha
            </Link>
            <Link
              href={projectTasksPath(row.original.name)}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Actividades
            </Link>
            <button
              onClick={() => openNotesModal(row.original.id)}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Nota
            </button>
          </div>
        ),
      },
    ],
    [
      projectsCapabilities,
      inlineEditingCell,
      secondaryCoordinatorByProject,
      setSecondaryCoordinatorByProject,
      updateCoordinator,
      updateProjectActive,
      getCoordinatorOptions,
    ]
  );

  return (
    <div className="space-y-6">
      {isLoadingData && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Sincronizando proyectos con el servidor...
        </div>
      )}
      {fetchError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="mt-0.5 shrink-0">&#9888;</span>
          {fetchError}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Proyectos</h2>
            <p className="mt-1 text-slate-600">Vista operativa para riesgo, entregas y carga por proyecto.</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              disabled={!projectsCapabilities.canCreateProject}
              title={projectsCapabilities.canCreateProject ? "" : "No tienes permiso para crear proyectos"}
              className={`rounded-xl px-5 py-2 text-sm font-medium text-white ${projectsCapabilities.canCreateProject ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
            >
              + Nuevo proyecto
            </button>

            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setStatusViewFilter("Activos")}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Activos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Activos
              </button>
              <button
                type="button"
                onClick={() => setStatusViewFilter("Archivados")}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Archivados" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Archivados
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtrar por nombre de proyecto..."
            className="h-10 w-72 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-500"
          />
          <select
            value={coordinatorFilter}
            onChange={(event) => setCoordinatorFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          >
            {coordinators.map((coordinator) => (
              <option key={coordinator} value={coordinator}>Encargado: {coordinator}</option>
            ))}
          </select>
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "Todos")}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          >
            <option value="Todos">Riesgo: todos</option>
            <option value="Alto">Riesgo alto</option>
            <option value="Medio">Riesgo medio</option>
            <option value="Bajo">Riesgo bajo</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Limpiar filtros
          </button>
          {projectsCapabilities.canExportData ? (
            <ExportMenu onExport={exportProjects} scaleClassName="scale-100" />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">Proyectos activos</p>
          <p className="mt-1 text-3xl font-bold text-slate-700">{kpiActiveProjects}</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-sm text-slate-700">Encargados activos</p>
          <p className="mt-1 text-3xl font-bold text-indigo-700">{orderedCoordinatorStats.length}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Etapas globales</p>
            <span className="text-xs text-slate-500">{totalStageAssignments} proyectos</span>
          </div>

          {orderedStageStats.length > 0 ? (() => {
            const defaultColors = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];
            const stageColorMap: Record<string, string> = { "Presale": "#f59e0b", "Diseño": "#6366f1", "Construcción": "#0ea5e9" };

            const slices = orderedStageStats.map(([stage, count], i) => {
              const pct = totalStageAssignments > 0 ? count / totalStageAssignments : 0;
              const percentage = Math.round(pct * 100);
              return { stage, count, pct, percentage, color: stageColorMap[stage] ?? defaultColors[i % defaultColors.length] };
            });

            const donutGradient = (() => {
              let cursor = 0;
              const gapDeg = 2;
              const segments = slices.flatMap((slice) => {
                if (slice.count === 0) return [];
                const sweep = slice.pct * 360;
                const start = cursor;
                const colorEnd = start + Math.max(0, sweep - gapDeg);
                const gapEnd = start + sweep;
                cursor = gapEnd;
                return [`${slice.color} ${start}deg ${colorEnd}deg`, `#f8fafc ${colorEnd}deg ${gapEnd}deg`];
              });
              if (segments.length === 0) return "conic-gradient(#e2e8f0 0deg 360deg)";
              return `conic-gradient(${segments.join(", ")})`;
            })();

            return (
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(230px,280px)_1fr] md:items-center">
                <div className="relative mx-auto h-56 w-56 rounded-full bg-slate-100 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)] md:h-64 md:w-64">
                  <div className="h-full w-full rounded-full" style={{ background: donutGradient, transform: "rotate(-90deg)" }} />
                  <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-inner ring-1 ring-slate-200 md:h-32 md:w-32">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</span>
                    <span className="text-3xl font-bold leading-none">{totalStageAssignments}</span>
                    <span className="mt-1 text-[11px] text-slate-500">proyectos</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {slices.map((slice) => (
                    <div key={`legend-${slice.stage}`} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                          {slice.stage}
                        </span>
                        <span className="font-semibold text-slate-900">{slice.count} ({slice.percentage}%)</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full" style={{ width: `${slice.percentage}%`, backgroundColor: slice.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : (
            <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">Sin etapas registradas.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Carga por encargado</p>
            <span className="text-xs text-slate-500">{orderedCoordinatorStats.length} persona(s)</span>
          </div>
          <div className="mt-3 space-y-2">
            {orderedCoordinatorStats.length > 0 ? orderedCoordinatorStats.map(([name, stats]) => (
              <div key={`coordinator-stat-${name}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{stats.total} proyecto(s)</span>
                </div>
                <div className="mt-1.5 flex gap-3">
                  {stats.design > 0 && (
                    <span className="flex items-center gap-1 text-xs text-indigo-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      Diseño: {stats.design}
                    </span>
                  )}
                  {stats.construction > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Construcción: {stats.construction}
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">Sin encargados registrados.</p>
            )}
          </div>
        </div>
      </div>

      <DataTable
        columns={projectColumns}
        data={visibleProjects}
        getRowId={(project) => `table-${project.id}`}
        tableClassName="min-w-[1100px]"
        emptyMessage="No hay proyectos con los filtros actuales."
        isLoading={isLoadingData && visibleProjects.length === 0}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {[
            { key: "activos", title: "Proyectos activos", items: visibleProjects.filter((project) => project.active) },
            { key: "archivados", title: "Proyectos archivados", items: visibleProjects.filter((project) => !project.active) },
          ].map((section) => (
            <div key={section.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{section.title}</h3>
                <span className="text-xs text-slate-500">{section.items.length}</span>
              </div>

              {section.items.length > 0 ? section.items.map((project) => (
                <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{project.code}</p>
                      <h3 className="text-xl font-bold text-slate-900">{project.name}</h3>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${projectStatusDotClasses(project.active)}`} />
                      <select
                        value={project.active ? "activo" : "archivado"}
                        onChange={(event) => updateProjectActive(project.id, event.target.value === "activo")}
                        disabled={!projectsCapabilities.canArchiveProject}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${projectStatusSelectClasses(project.active)}`}
                        aria-label={`Estado de ${project.name}`}
                      >
                        <option value="activo">Proyecto activo</option>
                        <option value="archivado">Proyecto archivado</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Cliente</p>
                      <p className="font-semibold text-slate-800">{project.client.name}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-600">Líder de diseño</p>
                        <select
                          value={normalizeName(project.coordinator) || "Sin responsable"}
                          onChange={(event) => updateCoordinator(project.id, event.target.value)}
                          disabled={!projectsCapabilities.canEditProjectGeneral}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                          aria-label={`Líder de diseño de ${project.name}`}
                        >
                          <option value="Sin responsable">Sin encargado</option>
                          {getCoordinatorOptions(project).map((member) => (
                            <option key={`card-coordinator-${project.id}-${member}`} value={member}>{member}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-600">Líder de construcción</p>
                        <select
                          value={secondaryCoordinatorByProject[project.id] || "Sin responsable"}
                          onChange={(event) => {
                            if (!projectsCapabilities.canEditProjectGeneral) return;
                            setSecondaryCoordinatorByProject((current) => ({ ...current, [project.id]: event.target.value }));
                          }}
                          disabled={!projectsCapabilities.canEditProjectGeneral}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                          aria-label={`Líder de construcción de ${project.name}`}
                        >
                          <option value="Sin responsable">Sin encargado</option>
                          {getCoordinatorOptions(project).map((member) => (
                            <option key={`card-construction-coordinator-${project.id}-${member}`} value={member}>{member}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {project.stage.split("/").map((stage) => stage.trim()).filter(Boolean).map((stage) => (
                      <span key={`card-stage-${project.id}-${stage}`} className="rounded-full border border-blue-200 bg-blue-100/70 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {stage}
                      </span>
                    ))}
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{project.type}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Avance</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{project.progress}%</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Próxima entrega</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800" suppressHydrationWarning>
                        {project.nextDelivery ? formatDate(project.nextDelivery.toISOString()) : "Sin fecha"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={projectTasksPath(project.name)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Actividades
                    </Link>
                    <a
                      href={project.drive?.administrativo || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive?.administrativo ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}
                    >
                      Docs del proyecto
                    </a>
                    <a
                      href={project.drive?.reportes || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-lg border px-4 py-2 text-sm font-medium ${project.drive?.reportes ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}
                    >
                      Docs del cliente
                    </a>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500" suppressHydrationWarning>
                      {project.startDate ? `Inicio: ${formatDate(project.startDate)} · ` : ""}
                      Alerta: {project.mainAlert}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openNotesModal(project.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Registrar nota
                      </button>
                      <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Ficha del proyecto
                      </Link>
                      {section.key === "archivados" ? (
                        <button
                          onClick={() => deleteProject(project.id)}
                          disabled={!projectsCapabilities.canDeleteProject}
                          title={projectsCapabilities.canDeleteProject ? "" : "No tienes permiso para eliminar proyectos"}
                          className={`rounded-lg border px-3 py-1 text-sm font-medium ${projectsCapabilities.canDeleteProject ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                        >
                          Eliminar proyecto
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No hay proyectos en esta seccion.
                </div>
              )}
            </div>
          ))}

          {visibleProjects.length === 0 ? (
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

      {activeNoteProject ? (
        <ProjectNotesModal
          projectName={activeNoteProject.name}
          notes={activeNotes}
          onClose={closeNotesModal}
          onSave={(content) => addNote(activeNoteProject.id, content)}
        />
      ) : null}

      {showCreateModal ? (
        <ProjectCreateModal
          activeClientOptions={activeClientOptions}
          activeTeamNames={activeTeamNames}
          projectTypeOptions={PROJECT_TYPE_OPTIONS}
          existingProjectIds={projectsData.map((p) => p.id)}
          existingClientIds={projectsData.map((p) => p.client.id)}
          onClose={() => setShowCreateModal(false)}
          onConfirm={(project) => { addProject(project); setShowCreateModal(false); router.push(`/proyectos/${project.id}/ficha`); }}
        />
      ) : null}
    </div>
  );
}

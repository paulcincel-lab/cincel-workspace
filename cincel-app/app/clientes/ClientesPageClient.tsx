"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import ExportMenu from "@/components/ui/ExportMenu";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import { projects as baseProjects } from "@/lib/data/projects";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import type { Task } from "@/lib/types/task";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { saveClients, fetchClients } from "@/lib/repositories/clients-repository";
import { saveProjects, fetchProjects, getProjectsSnapshot } from "@/lib/repositories/projects-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

type RiskLevel = "Alto" | "Medio" | "Bajo";
type ClientKind = "Empresa" | "Particular";
type ProjectType = "Habitacional" | "Oficina" | "Mobiliario" | "Comercial" | "Mantenimiento" | "Otro";

type ManualClient = {
  id: number;
  name: string;
  emails: string[];
  phone: string;
  kind: ClientKind;
  contacts: Array<{
    name: string;
    role: string;
    phone: string;
    email: string;
  }>;
  completedProjects: string[];
  acquisitionChannel: string;
  totalSpent: number;
  hasActiveProject: boolean;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  firstWorkDate: string;
};

type NewClientDraft = {
  name: string;
  emailsText: string;
  phone: string;
  kind: ClientKind;
  hasActiveProject: boolean;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  firstWorkDate: string;
};

type ClientSummary = {
  id: number;
  name: string;
  emails: string[];
  phone: string;
  kind: ClientKind;
  hasActiveProject: boolean;
  projectTypes: string[];
  projectNames: string[];
  totalProjectsWorked: number;
  firstWorkDate: string;
  projects: typeof baseProjects;
  activeProjects: number;
  averageProgress: number;
  totalTasks: number;
  blockedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  risk: RiskLevel;
  nextReviewDate: string;
};

const projectTypeOptions: ProjectType[] = [
  "Habitacional",
  "Oficina",
  "Mobiliario",
  "Comercial",
  "Mantenimiento",
  "Otro",
];

const emptyNewClientDraft: NewClientDraft = {
  name: "",
  emailsText: "",
  phone: "",
  kind: "Particular",
  hasActiveProject: false,
  projectName: "",
  projectType: "Otro",
  totalProjectsWorked: 1,
  firstWorkDate: "",
};

function loadPersistedProjects() {
  const parsed = getProjectsSnapshot() as Array<Partial<(typeof baseProjects)[number]>>;

  if (!Array.isArray(parsed)) {
    return baseProjects;
  }

  const normalized = parsed
    .map((item) => {
        const fallback = baseProjects.find(
          (project) => project.id === item.id || project.code === item.code || project.name === item.name
        );

        const incomingClient = item.client as Partial<(typeof baseProjects)[number]["client"]> | undefined;

        if (!fallback) {
          const clientId = typeof incomingClient?.id === "number"
            ? incomingClient.id
            : typeof item.id === "number"
              ? item.id
              : Date.now();

          return {
            id: typeof item.id === "number" ? item.id : Date.now(),
            code: typeof item.code === "string" && item.code ? item.code : `PRJ-${clientId}`,
            name: typeof item.name === "string" && item.name ? item.name : `Proyecto ${clientId}`,
            active: Boolean(item.active),
            status: typeof item.status === "string" && item.status ? item.status : statusFromActive(Boolean(item.active)),
            client: {
              id: clientId,
              name: typeof incomingClient?.name === "string" && incomingClient.name ? incomingClient.name : "Cliente",
              emails: Array.isArray(incomingClient?.emails)
                ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
                : [],
              phone: typeof incomingClient?.phone === "string" ? incomingClient.phone : "",
              kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
                ? incomingClient.kind
                : "Particular",
              contacts: Array.isArray(incomingClient?.contacts)
                ? incomingClient.contacts
                  .filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
                    Boolean(contact)
                    && typeof contact.name === "string"
                    && typeof contact.role === "string"
                    && typeof contact.phone === "string"
                    && typeof contact.email === "string"
                  )
                : [],
              completedProjects: Array.isArray(incomingClient?.completedProjects)
                ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                : [],
              acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
                ? incomingClient.acquisitionChannel
                : "Sin registro",
              totalSpent: typeof incomingClient?.totalSpent === "number" ? incomingClient.totalSpent : 0,
            },
            type: typeof item.type === "string" && item.type ? item.type : "Otro",
            stage: typeof item.stage === "string" && item.stage ? item.stage : "Presale",
            phase: typeof item.phase === "string" && item.phase ? item.phase : "Inicial",
            address: {
              street: item.address && typeof item.address.street === "string" ? item.address.street : "",
              city: item.address && typeof item.address.city === "string" ? item.address.city : "",
              state: item.address && typeof item.address.state === "string" ? item.address.state : "",
            },
            manager: typeof item.manager === "string" && item.manager ? item.manager : "Sin responsable",
            coordinator: typeof item.coordinator === "string" && item.coordinator ? item.coordinator : "Sin responsable",
            team: Array.isArray(item.team) ? item.team.filter((member): member is string => typeof member === "string") : [],
            progress: typeof item.progress === "number" ? item.progress : 0,
            drive: {
              administrativo: item.drive && typeof item.drive.administrativo === "string" ? item.drive.administrativo : "",
              planos: item.drive && typeof item.drive.planos === "string" ? item.drive.planos : "",
              renders: item.drive && typeof item.drive.renders === "string" ? item.drive.renders : "",
              reportes: item.drive && typeof item.drive.reportes === "string" ? item.drive.reportes : "",
            },
            startDate: typeof item.startDate === "string" && item.startDate ? item.startDate : "",
          };
        }

        return {
          ...fallback,
          ...item,
          client: {
            ...fallback.client,
            ...incomingClient,
            emails: Array.isArray(incomingClient?.emails)
              ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
              : fallback.client.emails,
            phone: typeof incomingClient?.phone === "string" ? incomingClient.phone : fallback.client.phone,
            kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
              ? incomingClient.kind
              : fallback.client.kind,
            contacts: Array.isArray(incomingClient?.contacts)
              ? incomingClient.contacts
                .filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
                  Boolean(contact)
                  && typeof contact.name === "string"
                  && typeof contact.role === "string"
                  && typeof contact.phone === "string"
                  && typeof contact.email === "string"
                )
              : Array.isArray(fallback.client.contacts)
                ? fallback.client.contacts
                : [],
            completedProjects: Array.isArray(incomingClient?.completedProjects)
              ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : Array.isArray(fallback.client.completedProjects)
                ? fallback.client.completedProjects
                : [],
            acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
              ? incomingClient.acquisitionChannel
              : fallback.client.acquisitionChannel,
            totalSpent: typeof incomingClient?.totalSpent === "number"
              ? incomingClient.totalSpent
              : fallback.client.totalSpent,
          },
          startDate: typeof item.startDate === "string" && item.startDate ? item.startDate : fallback.startDate,
        };
      })
    .filter((item): item is (typeof baseProjects)[number] => item !== null);

  return normalized.length > 0 ? normalized : baseProjects;
}

function loadPersistedTasks(workflow: "Presale" | "Diseño" | "Construcción", fallback: Task[]): Task[] {
  return loadLinkedTasks(workflow, fallback);
}

function getEarliestDate(dates: string[]): string {
  const validDates = dates
    .filter((value) => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (validDates.length === 0) {
    return "Sin fecha";
  }

  return validDates[0].toISOString().split("T")[0];
}

function riskFromSignals(blockedTasks: number, averageProgress: number): RiskLevel {
  if (blockedTasks > 0 || averageProgress < 45) {
    return "Alto";
  }

  if (averageProgress < 70) {
    return "Medio";
  }

  return "Bajo";
}

function statusFromActive(active: boolean): string {
  return active ? "Activo" : "Inactivo";
}

function normalizeProjectType(type: string): string {
  if (type === "Oficinas") {
    return "Oficina";
  }

  return type;
}

function normalizeClientKind(value: unknown): ClientKind {
  return value === "Empresa" ? "Empresa" : "Particular";
}

function updateManualClientsStorage(next: ManualClient[]) {
  saveClients(next).catch((err: unknown) => {
    if (err instanceof RepositoryError) reportRepositoryError(err);
  });
}

function updateProjectsStorage(next: (typeof baseProjects)) {
  saveProjects(next).catch((err: unknown) => {
    if (err instanceof RepositoryError) reportRepositoryError(err);
  });
}

function buildTimestampLabel(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `${date}-${time}`;
}

export default function ClientesPageClient({
  initialClients = [],
  initialProjects = [],
}: {
  initialClients?: ManualClient[];
  initialProjects?: typeof baseProjects;
} = {}) {
  const [projects, setProjects] = useState<typeof baseProjects>(
    initialProjects.length > 0 ? initialProjects : baseProjects
  );
  const [manualClients, setManualClients] = useState<ManualClient[]>(initialClients);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"Todos" | "Activos" | "Inactivos">("Todos");
  const [kindFilter, setKindFilter] = useState<"Todos" | ClientKind>("Todos");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"Todos" | ProjectType>("Todos");
  const [firstWorkDateSort, setFirstWorkDateSort] = useState<"reciente" | "antigua">("reciente");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newClientDraft, setNewClientDraft] = useState<NewClientDraft>(emptyNewClientDraft);

  useEffect(() => {
    // Clients + projects come from Postgres (server-rendered on first paint via
    // props, then refreshed here on focus). Tasks are still on the mock path.
    const loadLocal = () => {
      setAuthenticatedUser(getCurrentAuthenticatedUser());
      setAllTasks([
        ...loadPersistedTasks("Presale", presaleTasks),
        ...loadPersistedTasks("Diseño", disenoTasks),
        ...loadPersistedTasks("Construcción", operativasTasks),
      ]);
    };

    const hydrate = async () => {
      loadLocal();
      try {
        const [remoteProjects, remoteClients] = await Promise.all([
          fetchProjects(),
          fetchClients(),
        ]);
        setProjects(remoteProjects.length > 0 ? remoteProjects : loadPersistedProjects());
        setManualClients(remoteClients);
      } catch (err) {
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
        }
      }
    };

    const refresh = () => {
      void hydrate();
    };

    loadLocal();
    // Always revalidate once on mount (background — no loading flash) so stale
    // server-rendered data is corrected.
    void hydrate();

    const onVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const clientsCapabilities = useMemo(() => {
    return resolveClientsCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const clientColumns = useMemo<ColumnDef<ClientSummary, unknown>[]>(() => {
    return [
      {
        id: "name",
        accessorKey: "name",
        header: "Cliente",
        cell: ({ row }) => <div className="font-medium text-slate-800">{row.original.name}</div>,
      },
      {
        id: "emails",
        accessorFn: (client) => client.emails.join(", "),
        header: "Email(s)",
        cell: ({ row }) => (
          <span className="text-slate-700">{row.original.emails.join(", ") || "Sin correo"}</span>
        ),
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: "Numero de contacto",
        cell: ({ row }) => <span className="text-slate-700">{row.original.phone || "Sin numero"}</span>,
      },
      {
        id: "projectTypes",
        accessorFn: (client) => client.projectTypes.join(" / "),
        header: "Tipo de proyecto",
        cell: ({ row }) => <span className="text-slate-700">{row.original.projectTypes.join(" / ")}</span>,
      },
      {
        id: "kind",
        accessorKey: "kind",
        header: "Empresa o Particular",
        cell: ({ row }) => <span className="text-slate-700">{row.original.kind}</span>,
      },
      {
        id: "hasActiveProject",
        accessorKey: "hasActiveProject",
        header: "Proyecto activo",
        cell: ({ row }) => {
          const client = row.original;
          return (
            <Select
              value={client.hasActiveProject ? "si" : "no"}
              onValueChange={(value) => updateClientActiveInline(client.id, value === "si")}
              disabled={!clientsCapabilities.canEditClient}
            >
              <SelectTrigger className="h-auto border-0 bg-transparent px-1 py-1 text-xs" aria-label={`Proyecto activo ${client.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="si">Si</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "projectNames",
        accessorFn: (client) => client.projectNames.join(" / "),
        header: "Nombre del proyecto",
        cell: ({ row }) => <span className="text-slate-700">{row.original.projectNames.join(" / ")}</span>,
      },
      {
        id: "totalProjectsWorked",
        accessorKey: "totalProjectsWorked",
        header: "# proyectos con nosotros",
        cell: ({ row }) => <span className="text-slate-700">{row.original.totalProjectsWorked}</span>,
      },
      {
        id: "firstWorkDate",
        accessorKey: "firstWorkDate",
        header: "Fecha de primer trabajo",
        cell: ({ row }) => <span className="text-slate-700">{row.original.firstWorkDate}</span>,
      },
      {
        id: "ficha",
        header: () => <div className="text-right">Ficha</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link href={`/clientes/${row.original.id}`} className="text-xs font-medium text-blue-700 hover:underline">
              Ver ficha
            </Link>
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsCapabilities.canEditClient]);

  const clientSummaries = useMemo<ClientSummary[]>(() => {
    const taskMapByProject = new Map<string, Task[]>();

    for (const task of allTasks) {
      if (task.archived) {
        continue;
      }

      const current = taskMapByProject.get(task.project) ?? [];
      current.push(task);
      taskMapByProject.set(task.project, current);
    }

    const grouped = new Map<number, ClientSummary>();

    for (const project of projects) {
      const projectTasks = taskMapByProject.get(project.name) ?? [];
      const blockedTasks = projectTasks.filter((task) => task.status === "Bloqueado").length;
      const inProgressTasks = projectTasks.filter((task) => task.status === "En proceso").length;
      const pendingTasks = projectTasks.filter((task) => task.status === "Pendiente").length;

      const existing = grouped.get(project.client.id);

      if (!existing) {
        const nextReviewDate = getEarliestDate(projectTasks.map((task) => task.reviewDate));
        const baseAverage = Math.round(project.progress);

        grouped.set(project.client.id, {
          id: project.client.id,
          name: project.client.name,
          emails: project.client.emails,
          phone: project.client.phone,
          kind: normalizeClientKind(project.client.kind),
          hasActiveProject: project.active,
          projectTypes: [project.type],
          projectNames: [project.name],
          totalProjectsWorked: 1,
          firstWorkDate: getEarliestDate([project.startDate]),
          projects: [project],
          activeProjects: project.active ? 1 : 0,
          averageProgress: baseAverage,
          totalTasks: projectTasks.length,
          blockedTasks,
          inProgressTasks,
          pendingTasks,
          risk: riskFromSignals(blockedTasks, baseAverage),
          nextReviewDate,
        });

        continue;
      }

      const mergedProjects = [...existing.projects, project];
      const averageProgress = Math.round(
        mergedProjects.reduce((sum, item) => sum + item.progress, 0) / Math.max(mergedProjects.length, 1)
      );

      const reviewDates = [
        ...existing.projects.flatMap((item) => (taskMapByProject.get(item.name) ?? []).map((task) => task.reviewDate)),
        ...projectTasks.map((task) => task.reviewDate),
      ];

      const nextReviewDate = getEarliestDate(reviewDates);

      const updated = {
        ...existing,
        emails: Array.from(new Set([...existing.emails, ...project.client.emails])),
        phone: existing.phone || project.client.phone,
        kind: existing.kind,
        hasActiveProject: existing.hasActiveProject || project.active,
        projectTypes: Array.from(new Set([...existing.projectTypes, project.type])),
        projectNames: Array.from(new Set([...existing.projectNames, project.name])),
        totalProjectsWorked: existing.totalProjectsWorked + 1,
        firstWorkDate: getEarliestDate([existing.firstWorkDate, project.startDate]),
        projects: mergedProjects,
        activeProjects: existing.activeProjects + (project.active ? 1 : 0),
        averageProgress,
        totalTasks: existing.totalTasks + projectTasks.length,
        blockedTasks: existing.blockedTasks + blockedTasks,
        inProgressTasks: existing.inProgressTasks + inProgressTasks,
        pendingTasks: existing.pendingTasks + pendingTasks,
        nextReviewDate,
      };

      updated.risk = riskFromSignals(updated.blockedTasks, updated.averageProgress);
      grouped.set(project.client.id, updated);
    }

    for (const manualClient of manualClients) {
      if (grouped.has(manualClient.id)) {
        continue;
      }

      grouped.set(manualClient.id, {
        id: manualClient.id,
        name: manualClient.name,
        emails: manualClient.emails,
        phone: manualClient.phone,
        kind: manualClient.kind,
        hasActiveProject: manualClient.hasActiveProject,
        projectTypes: manualClient.projectType ? [manualClient.projectType] : [],
        projectNames: manualClient.projectName ? [manualClient.projectName] : [],
        totalProjectsWorked: Math.max(1, manualClient.totalProjectsWorked),
        firstWorkDate: manualClient.firstWorkDate || "Sin fecha",
        projects: [],
        activeProjects: manualClient.hasActiveProject ? 1 : 0,
        averageProgress: 0,
        totalTasks: 0,
        blockedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        risk: "Bajo",
        nextReviewDate: manualClient.firstWorkDate || "Sin fecha",
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.risk !== b.risk) {
        const score = { Alto: 3, Medio: 2, Bajo: 1 };
        return score[b.risk] - score[a.risk];
      }

      return b.activeProjects - a.activeProjects;
    });
  }, [projects, allTasks, manualClients]);

  const filteredClients = clientSummaries.filter((client) => {
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      client.name.toLowerCase().includes(searchValue) ||
      client.projectNames.some((name) => name.toLowerCase().includes(searchValue)) ||
      client.projectTypes.some((type) => type.toLowerCase().includes(searchValue));

    const matchesActive =
      activeFilter === "Todos"
        || (activeFilter === "Activos" && client.hasActiveProject)
        || (activeFilter === "Inactivos" && !client.hasActiveProject);

    const matchesKind = kindFilter === "Todos" || client.kind === kindFilter;

    const matchesProjectType =
      projectTypeFilter === "Todos"
        || client.projectTypes.some((type) => normalizeProjectType(type) === projectTypeFilter);

    return matchesSearch && matchesActive && matchesKind && matchesProjectType;
  }).sort((a, b) => {
    const aDate = Date.parse(a.firstWorkDate);
    const bDate = Date.parse(b.firstWorkDate);

    const aScore = Number.isNaN(aDate) ? Number.POSITIVE_INFINITY : aDate;
    const bScore = Number.isNaN(bDate) ? Number.POSITIVE_INFINITY : bDate;

    if (firstWorkDateSort === "antigua") {
      return aScore - bScore;
    }

    return bScore - aScore;
  });

  const activeProjectClients = filteredClients.filter((client) => client.hasActiveProject);
  const inactiveProjectClients = filteredClients.filter((client) => !client.hasActiveProject);

  const totalClients = clientSummaries.length;
  const totalActiveProjects = clientSummaries.reduce((sum, client) => sum + client.activeProjects, 0);

  const clientsExportColumns = useMemo<Array<ExportColumn<ClientSummary>>>(() => {
    return [
      { key: "name", header: "Cliente", getValue: (client) => client.name },
      { key: "emails", header: "Email(s)", getValue: (client) => client.emails.join(", ") || "Sin correo" },
      { key: "phone", header: "Numero de contacto", getValue: (client) => client.phone || "Sin numero" },
      { key: "projectTypes", header: "Tipo de proyecto", getValue: (client) => client.projectTypes.join(" / ") },
      { key: "kind", header: "Empresa o Particular", getValue: (client) => client.kind },
      { key: "hasActiveProject", header: "Proyecto activo", getValue: (client) => (client.hasActiveProject ? "Si" : "No") },
      { key: "projectNames", header: "Nombre del proyecto", getValue: (client) => client.projectNames.join(" / ") },
      { key: "totalProjects", header: "# proyectos con nosotros", getValue: (client) => client.totalProjectsWorked },
      { key: "firstWorkDate", header: "Fecha de primer trabajo", isDate: true, getValue: (client) => client.firstWorkDate },
    ];
  }, []);

  const exportClientsTable = async (rows: ClientSummary[], scope: "activos" | "inactivos", format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();

    await exportTableData({
      moduleName: `Clientes (${scope === "activos" ? "Activos" : "Inactivos"})`,
      fileName: `clientes-${scope}-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: clientsExportColumns,
      rows,
      landscape: true,
    });
  };

  const openCreateClient = () => {
    if (!clientsCapabilities.canCreateClient) {
      return;
    }

    setCreateError("");
    setNewClientDraft(emptyNewClientDraft);
    setShowCreateModal(true);
  };

  const closeCreateClient = () => {
    setShowCreateModal(false);
    setCreateError("");
  };

  const createClient = async () => {
    if (!clientsCapabilities.canCreateClient) {
      return;
    }

    const trimmedName = newClientDraft.name.trim();

    if (!trimmedName) {
      setCreateError("El nombre del cliente es obligatorio.");
      return;
    }

    const emails = newClientDraft.emailsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const usedIds = new Set([
      ...projects.map((project) => project.client.id),
      ...manualClients.map((client) => client.id),
    ]);

    let nextId = Math.max(1000, ...Array.from(usedIds)) + 1;
    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    const createdClient: ManualClient = {
      id: nextId,
      name: trimmedName,
      emails,
      phone: newClientDraft.phone.trim(),
      kind: newClientDraft.kind,
      contacts: [],
      completedProjects: [],
      acquisitionChannel: "Sin registro",
      totalSpent: 0,
      hasActiveProject: newClientDraft.hasActiveProject,
      projectName: newClientDraft.projectName.trim(),
      projectType: newClientDraft.projectType,
      totalProjectsWorked: Math.max(1, newClientDraft.totalProjectsWorked),
      firstWorkDate: newClientDraft.firstWorkDate,
    };

    const updatedManual = [...manualClients, createdClient];
    setManualClients(updatedManual);
    try {
      await saveClients(updatedManual);
    } catch {
      setManualClients(manualClients);
      setCreateError("No se pudo guardar el cliente. Intenta de nuevo.");
      return;
    }
    closeCreateClient();
  };

  const updateClientActiveInline = (clientId: number, active: boolean) => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    const isManual = manualClients.some((client) => client.id === clientId);

    if (isManual) {
      const updatedManual = manualClients.map((client) => (
        client.id === clientId
          ? {
              ...client,
              hasActiveProject: active,
            }
          : client
      ));

      setManualClients(updatedManual);
      updateManualClientsStorage(updatedManual);
      return;
    }

    const updatedProjects = projects.map((project) => (
      project.client.id === clientId
        ? {
            ...project,
            active,
            status: statusFromActive(active),
          }
        : project
    ));

    setProjects(updatedProjects);
    updateProjectsStorage(updatedProjects);
  };

  if (!clientsCapabilities.canViewClients) {
    return (
      <main className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Sin acceso al modulo Clientes</h1>
            <p className="mt-2 text-sm text-slate-600">Tu acceso actual no permite visualizar informacion comercial de clientes.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver al dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Relaciones comerciales</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">Clientes</h1>
              <p className="mt-2 text-sm text-slate-600">
                Gestiona cartera, detecta clientes en riesgo y entra directo al proyecto que requiere atención.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href="/proyectos"
                  className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Ver todos los proyectos
                </Link>

                <Button
                  onClick={openCreateClient}
                  disabled={!clientsCapabilities.canCreateClient}
                  title={clientsCapabilities.canCreateClient ? "" : "No tienes permiso para crear clientes"}
                >
                  Nuevo cliente
                </Button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <Button
                  variant={activeFilter === "Activos" ? "default" : "ghost"}
                  size="sm"
                  className="h-auto px-3 py-1 text-xs"
                  onClick={() => setActiveFilter("Activos")}
                >
                  Activos
                </Button>
                <Button
                  variant={activeFilter === "Inactivos" ? "default" : "ghost"}
                  size="sm"
                  className="h-auto px-3 py-1 text-xs"
                  onClick={() => setActiveFilter("Inactivos")}
                >
                  Desactivados
                </Button>
                <Button
                  variant={activeFilter === "Todos" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-auto px-3 py-1 text-xs"
                  onClick={() => setActiveFilter("Todos")}
                >
                  Todos
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente, proyecto o tipo"
              className="min-w-[220px] flex-1"
            />

            <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as "Todos" | ClientKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Empresa / Particular: Todos</SelectItem>
                <SelectItem value="Empresa">Empresa</SelectItem>
                <SelectItem value="Particular">Particular</SelectItem>
              </SelectContent>
            </Select>

            <Select value={projectTypeFilter} onValueChange={(value) => setProjectTypeFilter(value as "Todos" | ProjectType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Tipo de proyecto: Todos</SelectItem>
                {projectTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={firstWorkDateSort} onValueChange={(value) => setFirstWorkDateSort(value as "reciente" | "antigua")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reciente">Fecha primer trabajo: Mas reciente</SelectItem>
                <SelectItem value="antigua">Fecha primer trabajo: Mas antigua</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Clientes activos</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{totalClients}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Proyectos en cartera</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{totalActiveProjects}</p>
            </div>
          </div>
        </div>

        <section className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Clientes con proyecto activo</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{activeProjectClients.length}</span>
                      {clientsCapabilities.canExportData ? (
                        <ExportMenu onExport={(format) => exportClientsTable(activeProjectClients, "activos", format)} />
                      ) : null}
                    </div>
                  </div>

                  <DataTable
                    columns={clientColumns}
                    data={activeProjectClients}
                    getRowId={(client) => `active-${client.id}`}
                    emptyMessage="No hay clientes con proyecto activo para estos filtros."
                    tableClassName="min-w-full"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Clientes con proyectos inactivos</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{inactiveProjectClients.length}</span>
                      {clientsCapabilities.canExportData ? (
                        <ExportMenu onExport={(format) => exportClientsTable(inactiveProjectClients, "inactivos", format)} />
                      ) : null}
                    </div>
                  </div>

                  <DataTable
                    columns={clientColumns}
                    data={inactiveProjectClients}
                    getRowId={(client) => `inactive-${client.id}`}
                    emptyMessage="No hay clientes con proyectos inactivos para estos filtros."
                    tableClassName="min-w-full"
                  />
                </div>

                {filteredClients.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No hay clientes que coincidan con los filtros.
                  </div>
                ) : null}
              </div>
            </div>
        </section>

        <Sheet open={showCreateModal} onOpenChange={(next) => { if (!next) closeCreateClient(); }}>
          <SheetContent className="w-[672px] max-w-[672px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nuevo cliente</SheetTitle>
              <p className="text-sm text-slate-500">Crear cliente sin depender de un proyecto existente.</p>
            </SheetHeader>

            <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-client-name">Nombre del cliente</Label>
                <Input
                  id="new-client-name"
                  value={newClientDraft.name}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-phone">Numero de contacto</Label>
                <Input
                  id="new-client-phone"
                  value={newClientDraft.phone}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="new-client-emails">Email(s)</Label>
                <Input
                  id="new-client-emails"
                  value={newClientDraft.emailsText}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, emailsText: event.target.value }))}
                  placeholder="correo1@dominio.com, correo2@dominio.com"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-kind">Empresa o Particular</Label>
                <Select value={newClientDraft.kind} onValueChange={(value) => setNewClientDraft((prev) => ({ ...prev, kind: value as ClientKind }))}>
                  <SelectTrigger id="new-client-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Empresa">Empresa</SelectItem>
                    <SelectItem value="Particular">Particular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-has-active-project">Proyecto activo</Label>
                <Select
                  value={newClientDraft.hasActiveProject ? "si" : "no"}
                  onValueChange={(value) => setNewClientDraft((prev) => ({ ...prev, hasActiveProject: value === "si" }))}
                >
                  <SelectTrigger id="new-client-has-active-project" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">Si</SelectItem>
                    <SelectItem value="no">Ya termino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-project-name">Nombre del proyecto</Label>
                <Input
                  id="new-client-project-name"
                  value={newClientDraft.projectName}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, projectName: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-project-type">Tipo de proyecto</Label>
                <Select value={newClientDraft.projectType} onValueChange={(value) => setNewClientDraft((prev) => ({ ...prev, projectType: value as string }))}>
                  <SelectTrigger id="new-client-project-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projectTypeOptions.map((option) => (
                      <SelectItem key={`new-client-${option}`} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-total-projects">Numero de proyectos con nosotros</Label>
                <Input
                  id="new-client-total-projects"
                  type="number"
                  min={1}
                  value={newClientDraft.totalProjectsWorked}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, totalProjectsWorked: Number(event.target.value) || 1 }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-client-first-work-date">Fecha de primer trabajo</Label>
                <Input
                  id="new-client-first-work-date"
                  type="date"
                  value={newClientDraft.firstWorkDate}
                  onChange={(event) => setNewClientDraft((prev) => ({ ...prev, firstWorkDate: event.target.value }))}
                />
              </div>
            </div>

            {createError ? (
              <div className="mx-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            ) : null}

            <SheetFooter>
              <Button variant="outline" onClick={closeCreateClient}>
                Cancelar
              </Button>
              <Button onClick={createClient}>
                Crear cliente
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </section>
    </main>
  );
}
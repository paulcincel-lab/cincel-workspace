"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ExportMenu from "@/components/ui/ExportMenu";
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

type ClientProjectDraft = {
  id: number;
  name: string;
  type: string;
  active: boolean;
  startDate: string;
};

type ClientDraft = {
  name: string;
  emailsText: string;
  phone: string;
  kind: ClientKind;
  projects: ClientProjectDraft[];
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

export default function ClientesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<typeof baseProjects>(baseProjects);
  const [manualClients, setManualClients] = useState<ManualClient[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"Todos" | "Activos" | "Inactivos">("Todos");
  const [kindFilter, setKindFilter] = useState<"Todos" | ClientKind>("Todos");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"Todos" | ProjectType>("Todos");
  const [firstWorkDateSort, setFirstWorkDateSort] = useState<"reciente" | "antigua">("reciente");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingManualClientId, setEditingManualClientId] = useState<number | null>(null);
  const [editorError, setEditorError] = useState("");
  const [draft, setDraft] = useState<ClientDraft>({
    name: "",
    emailsText: "",
    phone: "",
    kind: "Particular",
    projects: [],
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newClientDraft, setNewClientDraft] = useState<NewClientDraft>(emptyNewClientDraft);

  useEffect(() => {
    // Clients now live in Postgres (fetched via a Server Action); projects and
    // tasks are still on the mock/localStorage path.
    const hydrate = async () => {
      setAuthenticatedUser(getCurrentAuthenticatedUser());
      setProjects(loadPersistedProjects());
      setAllTasks([
        ...loadPersistedTasks("Presale", presaleTasks),
        ...loadPersistedTasks("Diseño", disenoTasks),
        ...loadPersistedTasks("Construcción", operativasTasks),
      ]);
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

  const selectedClient = filteredClients.find((client) => client.id === selectedClientId) ?? filteredClients[0] ?? null;

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

  const openEditor = (client: ClientSummary) => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    setEditingClientId(client.id);
    setEditorError("");
    setDraft({
      name: client.name,
      emailsText: client.emails.join(", "),
      phone: client.phone,
      kind: client.kind,
      projects: client.projects.map((project) => ({
        id: project.id,
        name: project.name,
        type: normalizeProjectType(project.type),
        active: project.active,
        startDate: project.startDate || "",
      })),
    });
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingClientId(null);
    setEditingManualClientId(null);
    setEditorError("");
  };

  const updateDraftProject = (projectId: number, updates: Partial<ClientProjectDraft>) => {
    setDraft((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        return { ...project, ...updates };
      }),
    }));
  };

  const saveClientChanges = () => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    if (editingManualClientId !== null) {
      const trimmedName = draft.name.trim();
      if (!trimmedName) {
        setEditorError("El nombre del cliente es obligatorio.");
        return;
      }

      const emails = draft.emailsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const updatedManual = manualClients.map((client) => {
        if (client.id !== editingManualClientId) {
          return client;
        }

        return {
          ...client,
          name: trimmedName,
          emails,
          phone: draft.phone.trim(),
          kind: draft.kind,
        };
      });

      setManualClients(updatedManual);
      updateManualClientsStorage(updatedManual);
      closeEditor();
      return;
    }

    if (editingClientId === null) {
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setEditorError("El nombre del cliente es obligatorio.");
      return;
    }

    const emails = draft.emailsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const projectMap = new Map(
      draft.projects.map((project) => [project.id, project])
    );

    const updatedProjects = projects.map((project) => {
      if (project.client.id !== editingClientId) {
        return project;
      }

      const projectDraft = projectMap.get(project.id);

      if (!projectDraft) {
        return project;
      }

      return {
        ...project,
        name: projectDraft.name.trim() || project.name,
        type: projectDraft.type,
        active: projectDraft.active,
        status: statusFromActive(projectDraft.active),
        startDate: projectDraft.startDate || project.startDate,
        client: {
          ...project.client,
          name: trimmedName,
          emails,
          phone: draft.phone.trim(),
          kind: draft.kind,
        },
      };
    });

    setProjects(updatedProjects);
    updateProjectsStorage(updatedProjects);
    closeEditor();
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
    setSelectedClientId(createdClient.id);
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

  const convertManualClientToProject = () => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    if (!selectedClient) {
      return;
    }

    const manualClient = manualClients.find((client) => client.id === selectedClient.id);

    if (!manualClient) {
      return;
    }

    const usedProjectIds = new Set(projects.map((project) => project.id));
    let nextProjectId = Math.max(0, ...Array.from(usedProjectIds)) + 1;
    while (usedProjectIds.has(nextProjectId)) {
      nextProjectId += 1;
    }

    const projectName = manualClient.projectName.trim() || `${manualClient.name} Proyecto`;
    const createdProject = {
      id: nextProjectId,
      code: `CLT-${String(nextProjectId).padStart(3, "0")}`,
      name: projectName,
      active: manualClient.hasActiveProject,
      status: statusFromActive(manualClient.hasActiveProject),
      client: {
        id: manualClient.id,
        name: manualClient.name,
        emails: manualClient.emails,
        phone: manualClient.phone,
        kind: manualClient.kind,
        contacts: manualClient.contacts,
        completedProjects: manualClient.completedProjects,
        acquisitionChannel: manualClient.acquisitionChannel,
        totalSpent: manualClient.totalSpent,
      },
      type: manualClient.projectType || "Otro",
      stage: "Presale",
      phase: "Inicial",
      address: {
        street: "",
        city: "",
        state: "",
      },
      manager: "Sin responsable",
      coordinator: "Sin responsable",
      team: [],
      progress: 0,
      drive: {
        administrativo: "",
        planos: "",
        renders: "",
        reportes: "",
      },
      startDate: manualClient.firstWorkDate || new Date().toISOString().split("T")[0],
    };

    const updatedProjects = [...projects, createdProject];
    const updatedManualClients = manualClients.filter((client) => client.id !== manualClient.id);

    setProjects(updatedProjects);
    setManualClients(updatedManualClients);

    updateProjectsStorage(updatedProjects);
    updateManualClientsStorage(updatedManualClients);

    router.push(`/proyectos/${createdProject.id}/ficha`);
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

                <button
                  type="button"
                  onClick={openCreateClient}
                  disabled={!clientsCapabilities.canCreateClient}
                  title={clientsCapabilities.canCreateClient ? "" : "No tienes permiso para crear clientes"}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${clientsCapabilities.canCreateClient ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
                >
                  Nuevo cliente
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setActiveFilter("Activos")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${activeFilter === "Activos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Activos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("Inactivos")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${activeFilter === "Inactivos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Desactivados
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("Todos")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${activeFilter === "Todos" ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente, proyecto o tipo"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />

            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as "Todos" | ClientKind)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="Todos">Empresa / Particular: Todos</option>
              <option value="Empresa">Empresa</option>
              <option value="Particular">Particular</option>
            </select>

            <select
              value={projectTypeFilter}
              onChange={(event) => setProjectTypeFilter(event.target.value as "Todos" | ProjectType)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="Todos">Tipo de proyecto: Todos</option>
              {projectTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              value={firstWorkDateSort}
              onChange={(event) => setFirstWorkDateSort(event.target.value as "reciente" | "antigua")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="reciente">Fecha primer trabajo: Mas reciente</option>
              <option value="antigua">Fecha primer trabajo: Mas antigua</option>
            </select>
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

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="space-y-4 xl:col-span-2">
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

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="pb-3 pr-3 font-semibold">Cliente</th>
                          <th className="pb-3 pr-3 font-semibold">Email(s)</th>
                          <th className="pb-3 pr-3 font-semibold">Numero de contacto</th>
                          <th className="pb-3 pr-3 font-semibold">Tipo de proyecto</th>
                          <th className="pb-3 pr-3 font-semibold">Empresa o Particular</th>
                          <th className="pb-3 pr-3 font-semibold">Proyecto activo</th>
                          <th className="pb-3 pr-3 font-semibold">Nombre del proyecto</th>
                          <th className="pb-3 pr-3 font-semibold"># proyectos con nosotros</th>
                          <th className="pb-3 pr-3 font-semibold">Fecha de primer trabajo</th>
                          <th className="pb-3 pr-3 text-right font-semibold">Ficha</th>
                        </tr>
                      </thead>

                      <tbody>
                        {activeProjectClients.map((client) => {
                          const isSelected = selectedClient?.id === client.id;

                          return (
                            <tr
                              key={`active-${client.id}`}
                              onClick={() => setSelectedClientId(client.id)}
                              className={`cursor-pointer border-b border-slate-100 ${isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                            >
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-800">{client.name}</div>
                              </td>
                              <td className="py-3 pr-3 text-slate-700">{client.emails.join(", ") || "Sin correo"}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.phone || "Sin numero"}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.projectTypes.join(" / ")}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.kind}</td>
                              <td className="py-3 pr-3">
                                <select
                                  value={client.hasActiveProject ? "si" : "no"}
                                  onChange={(event) => updateClientActiveInline(client.id, event.target.value === "si")}
                                  disabled={!clientsCapabilities.canEditClient}
                                  className="bg-transparent px-1 py-1 text-xs text-slate-700 focus:outline-none"
                                  aria-label={`Proyecto activo ${client.name}`}
                                >
                                  <option value="si">Si</option>
                                  <option value="no">No</option>
                                </select>
                              </td>
                              <td className="py-3 pr-3 text-slate-700">{client.projectNames.join(" / ")}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.totalProjectsWorked}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.firstWorkDate}</td>
                              <td className="py-3 pr-3 text-right">
                                <Link href={`/clientes/${client.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                                  Ver ficha
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {activeProjectClients.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
                      No hay clientes con proyecto activo para estos filtros.
                    </div>
                  ) : null}
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

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="pb-3 pr-3 font-semibold">Cliente</th>
                          <th className="pb-3 pr-3 font-semibold">Email(s)</th>
                          <th className="pb-3 pr-3 font-semibold">Numero de contacto</th>
                          <th className="pb-3 pr-3 font-semibold">Tipo de proyecto</th>
                          <th className="pb-3 pr-3 font-semibold">Empresa o Particular</th>
                          <th className="pb-3 pr-3 font-semibold">Proyecto activo</th>
                          <th className="pb-3 pr-3 font-semibold">Nombre del proyecto</th>
                          <th className="pb-3 pr-3 font-semibold"># proyectos con nosotros</th>
                          <th className="pb-3 pr-3 font-semibold">Fecha de primer trabajo</th>
                          <th className="pb-3 pr-3 text-right font-semibold">Ficha</th>
                        </tr>
                      </thead>

                      <tbody>
                        {inactiveProjectClients.map((client) => {
                          const isSelected = selectedClient?.id === client.id;

                          return (
                            <tr
                              key={`inactive-${client.id}`}
                              onClick={() => setSelectedClientId(client.id)}
                              className={`cursor-pointer border-b border-slate-100 ${isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                            >
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-800">{client.name}</div>
                              </td>
                              <td className="py-3 pr-3 text-slate-700">{client.emails.join(", ") || "Sin correo"}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.phone || "Sin numero"}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.projectTypes.join(" / ")}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.kind}</td>
                              <td className="py-3 pr-3">
                                <select
                                  value={client.hasActiveProject ? "si" : "no"}
                                  onChange={(event) => updateClientActiveInline(client.id, event.target.value === "si")}
                                  disabled={!clientsCapabilities.canEditClient}
                                  className="bg-transparent px-1 py-1 text-xs text-slate-700 focus:outline-none"
                                  aria-label={`Proyecto activo ${client.name}`}
                                >
                                  <option value="si">Si</option>
                                  <option value="no">No</option>
                                </select>
                              </td>
                              <td className="py-3 pr-3 text-slate-700">{client.projectNames.join(" / ")}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.totalProjectsWorked}</td>
                              <td className="py-3 pr-3 text-slate-700">{client.firstWorkDate}</td>
                              <td className="py-3 pr-3 text-right">
                                <Link href={`/clientes/${client.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                                  Ver ficha
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {inactiveProjectClients.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
                      No hay clientes con proyectos inactivos para estos filtros.
                    </div>
                  ) : null}
                </div>

                {filteredClients.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No hay clientes que coincidan con los filtros.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Detalle del cliente</h2>

              {selectedClient ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!clientsCapabilities.canEditClient) {
                          return;
                        }

                        const manualMatch = manualClients.find((item) => item.id === selectedClient.id);

                        if (manualMatch) {
                          setEditingClientId(null);
                          setEditingManualClientId(manualMatch.id);
                          setEditorError("");
                          setDraft({
                            name: manualMatch.name,
                            emailsText: manualMatch.emails.join(", "),
                            phone: manualMatch.phone,
                            kind: manualMatch.kind,
                            projects: [],
                          });
                          setShowEditor(true);
                          return;
                        }

                        openEditor(selectedClient);
                      }}
                      disabled={!clientsCapabilities.canEditClient}
                      title={clientsCapabilities.canEditClient ? "" : "No tienes permiso para editar clientes"}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${clientsCapabilities.canEditClient ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                    >
                      Editar cliente
                    </button>
                    <Link
                      href={`/clientes/${selectedClient.id}`}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Abrir ficha del cliente
                    </Link>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <Avatar name={selectedClient.name} />
                    <p className="mt-2 text-xs text-slate-500">
                      {selectedClient.emails.length > 0 ? selectedClient.emails.join(" · ") : "Sin correos registrados"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Contacto: {selectedClient.phone || "Sin numero"}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Numero de proyectos con nosotros</p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">{selectedClient.totalProjectsWorked}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">Fecha de primer trabajo</p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">{selectedClient.firstWorkDate}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <p><span className="text-slate-500">Tipo de cliente:</span> {selectedClient.kind}</p>
                    <p className="mt-1"><span className="text-slate-500">Proyecto activo:</span> {selectedClient.hasActiveProject ? "Si" : "Ya termino"}</p>
                    <p className="mt-1"><span className="text-slate-500">Tipo de proyecto:</span> {selectedClient.projectTypes.join(" / ")}</p>
                    <p className="mt-1"><span className="text-slate-500">Riesgo operativo:</span> {selectedClient.risk}</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Proyectos del cliente</p>
                    <div className="mt-2 space-y-2">
                      {selectedClient.projects.map((project) => (
                        <div key={project.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-800">{project.name}</p>
                              <p className="text-xs text-slate-500">{project.stage} · {project.phase}</p>
                            </div>
                            <Badge
                              label={project.status}
                              color={project.active ? "green" : "gray"}
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              href={`/tareas?project=${encodeURIComponent(project.name)}`}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Ver actividades
                            </Link>
                          </div>
                        </div>
                      ))}

                      {selectedClient.projects.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                          <p>Cliente sin proyecto operativo vinculado.</p>
                          <button
                            type="button"
                            onClick={convertManualClientToProject}
                            disabled={!clientsCapabilities.canEditClient}
                            title={clientsCapabilities.canEditClient ? "" : "No tienes permiso para editar clientes"}
                            className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-white ${clientsCapabilities.canEditClient ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
                          >
                            Convertir a proyecto
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Selecciona un cliente de la tabla para ver su detalle.
                </div>
              )}
            </div>
          </aside>
        </div>

        {showEditor ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
            <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Editar cliente</h2>
                  <p className="text-sm text-slate-500">Actualiza datos de contacto y proyectos relacionados.</p>
                </div>

                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    Nombre del cliente
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    Numero de contacto
                    <input
                      value={draft.phone}
                      onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-sm text-slate-700 sm:col-span-2">
                    Email(s) del cliente
                    <input
                      value={draft.emailsText}
                      onChange={(event) => setDraft((prev) => ({ ...prev, emailsText: event.target.value }))}
                      placeholder="correo1@dominio.com, correo2@dominio.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    Empresa o Particular
                    <select
                      value={draft.kind}
                      onChange={(event) => setDraft((prev) => ({ ...prev, kind: event.target.value as ClientKind }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Empresa">Empresa</option>
                      <option value="Particular">Particular</option>
                    </select>
                  </label>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">Proyectos del cliente</p>
                  <div className="mt-2 space-y-3">
                    {draft.projects.map((project) => (
                      <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm text-slate-700">
                            Nombre del proyecto
                            <input
                              value={project.name}
                              onChange={(event) => updateDraftProject(project.id, { name: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </label>

                          <label className="text-sm text-slate-700">
                            Tipo de proyecto
                            <select
                              value={project.type}
                              onChange={(event) => updateDraftProject(project.id, { type: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              {!projectTypeOptions.includes(project.type as ProjectType) ? (
                                <option value={project.type}>{project.type}</option>
                              ) : null}
                              {projectTypeOptions.map((option) => (
                                <option key={`${project.id}-${option}`} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-sm text-slate-700">
                            Proyecto activo
                            <select
                              value={project.active ? "si" : "no"}
                              onChange={(event) => updateDraftProject(project.id, { active: event.target.value === "si" })}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              <option value="si">Si</option>
                              <option value="no">Ya termino</option>
                            </select>
                          </label>

                          <label className="text-sm text-slate-700">
                            Fecha de primer trabajo
                            <input
                              type="date"
                              value={project.startDate}
                              onChange={(event) => updateDraftProject(project.id, { startDate: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {editorError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {editorError}
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveClientChanges}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showCreateModal ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
            <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Nuevo cliente</h2>
                  <p className="text-sm text-slate-500">Crear cliente sin depender de un proyecto existente.</p>
                </div>

                <button
                  type="button"
                  onClick={closeCreateClient}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  Nombre del cliente
                  <input
                    value={newClientDraft.name}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, name: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Numero de contacto
                  <input
                    value={newClientDraft.phone}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, phone: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700 sm:col-span-2">
                  Email(s)
                  <input
                    value={newClientDraft.emailsText}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, emailsText: event.target.value }))}
                    placeholder="correo1@dominio.com, correo2@dominio.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Empresa o Particular
                  <select
                    value={newClientDraft.kind}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, kind: event.target.value as ClientKind }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Empresa">Empresa</option>
                    <option value="Particular">Particular</option>
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Proyecto activo
                  <select
                    value={newClientDraft.hasActiveProject ? "si" : "no"}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, hasActiveProject: event.target.value === "si" }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="si">Si</option>
                    <option value="no">Ya termino</option>
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Nombre del proyecto
                  <input
                    value={newClientDraft.projectName}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, projectName: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Tipo de proyecto
                  <select
                    value={newClientDraft.projectType}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, projectType: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {projectTypeOptions.map((option) => (
                      <option key={`new-client-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Numero de proyectos con nosotros
                  <input
                    type="number"
                    min={1}
                    value={newClientDraft.totalProjectsWorked}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, totalProjectsWorked: Number(event.target.value) || 1 }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Fecha de primer trabajo
                  <input
                    type="date"
                    value={newClientDraft.firstWorkDate}
                    onChange={(event) => setNewClientDraft((prev) => ({ ...prev, firstWorkDate: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              {createError ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeCreateClient}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createClient}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Crear cliente
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
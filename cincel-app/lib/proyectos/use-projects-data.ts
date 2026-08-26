"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { saveProjects, fetchProjects } from "@/lib/repositories/projects-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import { SupabaseOperationError, reportSupabaseError } from "@/lib/supabase/errors";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";
const NOTES_STORAGE_KEY = "cincel.projects.notes.v1";

export type ProjectItem = (typeof projects)[number];

export type ProjectNote = {
  id: string;
  projectId: number;
  content: string;
  createdAt: string;
};

/** Coerces a value to a non-empty string or null. */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function loadPersistedTasks(workflow: string, fallback: Task[]): Task[] {
  if (workflow === "Presale" || workflow === "Diseño" || workflow === "Construcción") {
    return loadLinkedTasks(workflow, fallback);
  }
  return fallback;
}

function loadProjectNotes(): Record<number, ProjectNote[]> {
  if (typeof window === "undefined") return {};
  const stored = readStorage(NOTES_STORAGE_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<number, ProjectNote[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    removeStorage(NOTES_STORAGE_KEY);
    return {};
  }
}

function loadPersistedProjects(): ProjectItem[] {
  if (typeof window === "undefined") return projects;
  if (isSupabaseEnabled()) return projects;
  const stored = readStorage("cincel.projects.data.v1");
  if (!stored) return projects;
  try {
    const parsed = JSON.parse(stored) as Array<Partial<ProjectItem>>;
    if (!Array.isArray(parsed)) return projects;
    const normalized = parsed
      .map((item) => {
        const fallback = projects.find(
          (project) => project.code === item.code || project.name === item.name
        );
        if (!fallback) {
          const rawId = item.id;
          const numericId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
          const safeId = Number.isFinite(numericId) ? numericId : Date.now();
          const incomingClient = item.client as Partial<ProjectItem["client"]> | undefined;
          const safeCoordinator = normalizeName(item.coordinator) || "Sin responsable";
          return {
            id: safeId,
            code: typeof item.code === "string" && item.code ? item.code : `PRJ-${safeId}`,
            name: typeof item.name === "string" && item.name ? item.name : `Proyecto ${safeId}`,
            active: Boolean(item.active),
            status: typeof item.status === "string" && item.status ? item.status : (item.active ? "Activo" : "Inactivo"),
            client: {
              id: typeof incomingClient?.id === "number" ? incomingClient.id : safeId,
              name: normalizeName(incomingClient?.name) || "Cliente",
              emails: Array.isArray(incomingClient?.emails) ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0) : [],
              phone: normalizeName(incomingClient?.phone) || "",
              kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular" ? incomingClient.kind : "Particular",
              contacts: Array.isArray(incomingClient?.contacts) ? incomingClient.contacts.filter((contact): contact is { name: string; role: string; phone: string; email: string } => Boolean(contact) && typeof contact.name === "string" && typeof contact.role === "string" && typeof contact.phone === "string" && typeof contact.email === "string") : [],
              completedProjects: Array.isArray(incomingClient?.completedProjects) ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [],
              acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string" ? incomingClient.acquisitionChannel : "Sin registro",
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
            manager: normalizeName(item.manager) || "Sin responsable",
            coordinator: safeCoordinator,
            team: Array.isArray(item.team) ? item.team.filter((member): member is string => typeof member === "string") : [],
            progress: typeof item.progress === "number" ? item.progress : 0,
            drive: {
              administrativo: item.drive && typeof item.drive.administrativo === "string" ? item.drive.administrativo : "",
              planos: item.drive && typeof item.drive.planos === "string" ? item.drive.planos : "",
              renders: item.drive && typeof item.drive.renders === "string" ? item.drive.renders : "",
              reportes: item.drive && typeof item.drive.reportes === "string" ? item.drive.reportes : "",
            },
            startDate: typeof item.startDate === "string" ? item.startDate : "",
          } as ProjectItem;
        }
        const rawId = item.id;
        const numericId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
        const safeId = Number.isFinite(numericId) ? numericId : fallback.id;
        const safeCoordinator = normalizeName(item.coordinator) || fallback.coordinator || "Sin responsable";
        const incomingClient = item.client as Partial<ProjectItem["client"]> | undefined;
        const safeClient = {
          ...fallback.client,
          ...incomingClient,
          emails: Array.isArray(incomingClient?.emails) ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0) : fallback.client.emails,
          phone: normalizeName(incomingClient?.phone) || fallback.client.phone || "",
          kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular" ? incomingClient.kind : fallback.client.kind,
          contacts: Array.isArray(incomingClient?.contacts) ? incomingClient.contacts.filter((contact): contact is { name: string; role: string; phone: string; email: string } => Boolean(contact) && typeof contact.name === "string" && typeof contact.role === "string" && typeof contact.phone === "string" && typeof contact.email === "string") : Array.isArray(fallback.client.contacts) ? fallback.client.contacts : [],
          completedProjects: Array.isArray(incomingClient?.completedProjects) ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : Array.isArray(fallback.client.completedProjects) ? fallback.client.completedProjects : [],
          acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string" ? incomingClient.acquisitionChannel : fallback.client.acquisitionChannel,
          totalSpent: typeof incomingClient?.totalSpent === "number" ? incomingClient.totalSpent : fallback.client.totalSpent,
        };
        return { ...fallback, ...item, id: safeId, coordinator: safeCoordinator, client: safeClient } as ProjectItem;
      })
      .filter((item): item is ProjectItem => item !== null);
    return normalized.length > 0 ? normalized : projects;
  } catch {
    removeStorage("cincel.projects.data.v1");
    return projects;
  }
}

function loadActiveTeamNames(): string[] {
  if (typeof window === "undefined") {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }
  const stored = readStorage(TEAM_MEMBERS_STORAGE_KEY);
  if (!stored) return teamMembers.filter((member) => member.active).map((member) => member.name);
  try {
    const parsed = JSON.parse(stored) as Array<{ name?: unknown; active?: boolean }>;
    if (!Array.isArray(parsed)) return teamMembers.filter((member) => member.active).map((member) => member.name);
    return parsed
      .filter((member) => member.active)
      .map((member) => normalizeName(member.name))
      .filter((name): name is string => name !== null);
  } catch {
    return teamMembers.filter((member) => member.active).map((member) => member.name);
  }
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") return {};
  const stored = readStorage(SECONDARY_COORDINATOR_STORAGE_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export type AllTasksSnapshot = Task[];

export interface UseProjectsDataReturn {
  projectsData: ProjectItem[];
  isLoadingData: boolean;
  fetchError: string | null;
  activeTeamNames: string[];
  authenticatedUser: ReturnType<typeof getCurrentAuthenticatedUser>;
  secondaryCoordinatorByProject: Record<number, string>;
  setSecondaryCoordinatorByProject: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  notesByProject: Record<number, ProjectNote[]>;
  allTasks: AllTasksSnapshot;
  addProject: (project: ProjectItem) => void;
  updateCoordinator: (projectId: number, coordinator: string) => void;
  updateProjectActive: (projectId: number, active: boolean) => void;
  removeProject: (projectId: number) => void;
  addNote: (projectId: number, content: string) => void;
}

/**
 * Manages projects data: Supabase hydration, debounced autosave,
 * secondary coordinator persistence, team sync, and notes.
 * Follows the pattern of lib/settings/use-general-settings.ts.
 */
export function useProjectsData(): UseProjectsDataReturn {
  const [projectsData, setProjectsData] = useState<ProjectItem[]>(() => loadPersistedProjects());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [isLoadingData, setIsLoadingData] = useState(() => isSupabaseEnabled());
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notesByProject, setNotesByProject] = useState<Record<number, ProjectNote[]>>(() => loadProjectNotes());

  const lastSavedRef = useRef<ProjectItem[]>(projectsData);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced (800ms) diffed autosave: only sends rows that actually changed.
  useEffect(() => {
    const changed = projectsData.filter((project) => {
      const saved = lastSavedRef.current.find((p) => p.id === project.id);
      return !saved || JSON.stringify(project) !== JSON.stringify(saved);
    });
    if (changed.length === 0) return;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = projectsData;
      const payload = isSupabaseEnabled() ? changed : projectsData;
      saveProjects(payload).catch((err: unknown) => {
        if (err instanceof SupabaseOperationError) reportSupabaseError(err);
      });
    }, 800);
    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, [projectsData]);

  // Persist secondary coordinator map on every change.
  useEffect(() => {
    writeStorage(SECONDARY_COORDINATOR_STORAGE_KEY, JSON.stringify(secondaryCoordinatorByProject));
  }, [secondaryCoordinatorByProject]);

  // Hydrate from Supabase on mount, and keep team names / auth user fresh.
  useEffect(() => {
    const refreshTeam = () => {
      setActiveTeamNames(loadActiveTeamNames());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    const hydrate = async () => {
      setIsLoadingData(true);
      setFetchError(null);
      try {
        const remote = await fetchProjects();
        if (remote.length > 0) {
          lastSavedRef.current = remote;
          setProjectsData(remote);
        }
      } catch (err) {
        if (err instanceof SupabaseOperationError) {
          reportSupabaseError(err);
          setFetchError("No se pudo sincronizar con el servidor. Los datos mostrados pueden estar desactualizados.");
        }
      } finally {
        setIsLoadingData(false);
      }
    };
    void hydrate();

    window.addEventListener("focus", refreshTeam);
    window.addEventListener("storage", refreshTeam);
    return () => {
      window.removeEventListener("focus", refreshTeam);
      window.removeEventListener("storage", refreshTeam);
    };
  }, []);

  const allTasks = useMemo<AllTasksSnapshot>(() => [
    ...loadPersistedTasks("Presale", presaleTasks),
    ...loadPersistedTasks("Diseño", disenoTasks),
    ...loadPersistedTasks("Construcción", operativasTasks),
  ], []);

  const addProject = (project: ProjectItem) => {
    const nextProjects = [project, ...projectsData];
    lastSavedRef.current = nextProjects;
    setProjectsData(nextProjects);
    saveProjects(nextProjects).catch((err: unknown) => {
      if (err instanceof SupabaseOperationError) reportSupabaseError(err);
    });
  };

  const updateCoordinator = (projectId: number, coordinator: string) => {
    setProjectsData((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, coordinator } : project
      )
    );
  };

  const updateProjectActive = (projectId: number, active: boolean) => {
    setProjectsData((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, active, status: active ? "Activo" : "Archivado" }
          : project
      )
    );
  };

  const removeProject = (projectId: number) => {
    setProjectsData((current) => current.filter((item) => item.id !== projectId));
    setNotesByProject((current) => {
      const next = { ...current };
      delete next[projectId];
      writeStorage(NOTES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const addNote = (projectId: number, content: string) => {
    const newNote: ProjectNote = {
      id: `${projectId}-${Date.now()}`,
      projectId,
      content,
      createdAt: new Date().toISOString(),
    };
    setNotesByProject((current) => {
      const next = { ...current, [projectId]: [newNote, ...(current[projectId] ?? [])] };
      writeStorage(NOTES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return {
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
  };
}

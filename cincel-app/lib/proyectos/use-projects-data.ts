"use client";

import { useEffect, useRef, useState } from "react";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { projects } from "@/lib/data/projects";
import { teamMembers } from "@/lib/data/team";
import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { saveProjects, fetchProjects, deleteProject } from "@/lib/repositories/projects-repository";
import { fetchTeamMembersPublic } from "@/lib/repositories/team-repository";
import { fetchActivities } from "@/lib/repositories/activities-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

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

/**
 * Synchronous seed used for first paint. Projects live in Postgres now
 * (Phase 2) — the hook replaces this with `fetchProjects()` on mount.
 */
function loadPersistedProjects(): ProjectItem[] {
  return projects;
}

/** Pre-hydration seed; the hook replaces this with `fetchTeamMembersPublic()`. */
function loadActiveTeamNames(): string[] {
  return teamMembers.filter((member) => member.active).map((member) => member.name);
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
export function useProjectsData(
  initialProjects?: ProjectItem[]
): UseProjectsDataReturn {
  const hasInitial = initialProjects !== undefined && initialProjects.length > 0;
  const [projectsData, setProjectsData] = useState<ProjectItem[]>(
    () => initialProjects ?? loadPersistedProjects()
  );
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeTeamNames, setActiveTeamNames] = useState<string[]>(() => loadActiveTeamNames());
  const [allTasks, setAllTasks] = useState<AllTasksSnapshot>(() => [
    ...loadPersistedTasks("Presale", presaleTasks),
    ...loadPersistedTasks("Diseño", disenoTasks),
    ...loadPersistedTasks("Construcción", operativasTasks),
  ]);
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [isLoadingData, setIsLoadingData] = useState(!hasInitial);
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
      saveProjects(changed).catch((err: unknown) => {
        if (err instanceof RepositoryError) reportRepositoryError(err);
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

  // Hydrate from Postgres on mount (skipped when the page already provided
  // server-rendered data), and keep team names / auth user fresh.
  useEffect(() => {
    const refreshTeam = () => {
      setActiveTeamNames(loadActiveTeamNames());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    const hydrate = async () => {
      // Don't flash a loading state when the page already server-rendered data;
      // this is a background revalidation to catch any SSR staleness.
      if (!hasInitial) setIsLoadingData(true);
      setFetchError(null);
      try {
        const remote = await fetchProjects();
        if (remote.length > 0) {
          lastSavedRef.current = remote;
          setProjectsData(remote);
        }
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
        setFetchError("No se pudo sincronizar con el servidor. Los datos mostrados pueden estar desactualizados.");
      } finally {
        setIsLoadingData(false);
      }
    };
    const hydrateTeam = () => {
      void fetchTeamMembersPublic()
        .then((rows) => {
          const names = rows
            .filter((m) => m.active)
            .map((m) => normalizeName(m.name))
            .filter((n): n is string => n !== null);
          if (names.length > 0) setActiveTeamNames(names);
        })
        .catch(() => undefined);
    };

    const hydrateTasks = () => {
      void Promise.all([
        fetchActivities("Presale"),
        fetchActivities("Diseño"),
        fetchActivities("Construcción"),
        fetchActivities("Decoración"),
      ])
        .then(([p, d, c, dec]) => {
          const merged = [...p, ...d, ...c, ...dec];
          if (merged.length > 0) setAllTasks(merged);
        })
        .catch(() => undefined);
    };

    void hydrate();
    hydrateTeam();
    hydrateTasks();

    const onExternalChange = () => {
      refreshTeam();
      hydrateTeam();
    };
    window.addEventListener("focus", onExternalChange);
    window.addEventListener("storage", onExternalChange);
    return () => {
      window.removeEventListener("focus", onExternalChange);
      window.removeEventListener("storage", onExternalChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProject = (project: ProjectItem) => {
    const nextProjects = [project, ...projectsData];
    lastSavedRef.current = nextProjects;
    setProjectsData(nextProjects);
    saveProjects([project]).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
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
    setProjectsData((current) => {
      const next = current.filter((item) => item.id !== projectId);
      return next;
    });
    lastSavedRef.current = lastSavedRef.current.filter((item) => item.id !== projectId);
    deleteProject(projectId).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
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

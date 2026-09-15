"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import {
  fetchProjectsAction,
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
} from "@/lib/actions/projects-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import type { ProjectFilters } from "@/lib/repositories/projects-repository";
import type { ProjectInput, ProjectListItem, Staff } from "@/lib/types/core";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

export type ProjectItem = ProjectListItem;

export interface UseProjectsDataReturn {
  projectsData: ProjectItem[];
  isLoadingData: boolean;
  fetchError: string | null;
  activeStaff: Staff[];
  authenticatedUser: ReturnType<typeof getCurrentAuthenticatedUser>;
  refresh: () => Promise<void>;
  addProject: (input: ProjectInput) => Promise<ProjectItem | null>;
  updateProject: (id: string, patch: Partial<ProjectInput>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
}

/**
 * Manages the projects list against the Phase 2 data-access layer
 * (`lib/actions/projects-actions.ts`). Every write goes straight to the
 * server — there is no client-side autosave/diff layer anymore, since each
 * server action already validates and revalidates on its own.
 */
export function useProjectsData(
  initialProjects?: ProjectItem[],
  filters?: ProjectFilters
): UseProjectsDataReturn {
  const hasInitial = initialProjects !== undefined;
  const [projectsData, setProjectsData] = useState<ProjectItem[]>(initialProjects ?? []);
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [activeStaff, setActiveStaff] = useState<Staff[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(!hasInitial);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });

  const refresh = useCallback(async () => {
    setFetchError(null);
    try {
      const rows = await fetchProjectsAction(filtersRef.current ?? {});
      setProjectsData(rows);
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
      setFetchError("No se pudo sincronizar con el servidor. Los datos mostrados pueden estar desactualizados.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    // Sync projects with the server on mount — refresh() is also reused by
    // addProject/updateProject/removeProject, so it can't be inlined here
    // without duplicating the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void fetchStaffAction()
      .then((rows) => setActiveStaff(rows.filter((s) => s.active)))
      .catch(() => undefined);

    const onExternalChange = () => setAuthenticatedUser(getCurrentAuthenticatedUser());
    window.addEventListener("focus", onExternalChange);
    return () => window.removeEventListener("focus", onExternalChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProject = useCallback(
    async (input: ProjectInput): Promise<ProjectItem | null> => {
      try {
        await createProjectAction(input);
        await refresh();
        return projectsData.find((p) => p.name === input.name) ?? null;
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
        throw err;
      }
    },
    [refresh, projectsData]
  );

  const updateProject = useCallback(
    async (id: string, patch: Partial<ProjectInput>) => {
      setProjectsData((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        await updateProjectAction(id, patch);
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
        await refresh();
        throw err;
      }
    },
    [refresh]
  );

  const removeProject = useCallback(
    async (id: string) => {
      setProjectsData((current) => current.filter((p) => p.id !== id));
      try {
        await deleteProjectAction(id);
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
        await refresh();
        throw err;
      }
    },
    [refresh]
  );

  return {
    projectsData,
    isLoadingData,
    fetchError,
    activeStaff,
    authenticatedUser,
    refresh,
    addProject,
    updateProject,
    removeProject,
  };
}

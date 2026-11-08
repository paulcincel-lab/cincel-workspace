import { queryOptions } from "@tanstack/react-query";

import {
  fetchCatalogAssignableStaff,
  fetchCatalogContacts,
  fetchCatalogProjectOptions,
  fetchCatalogProjectSpaces,
  fetchCatalogStaff,
  fetchCatalogTaskStatuses,
  fetchCatalogWorkflows,
} from "@/lib/actions/page-data/catalog-actions";
import { STALE, qk } from "@/lib/query/keys";
import type {
  CatalogAssignableStaffOption,
  CatalogContactOption,
  CatalogProjectOption,
  CatalogStaffOption,
} from "@/lib/types/catalog";
import type { ContactType, ProjectSpace, TaskStatusOption, WorkflowRef } from "@/lib/types/core";

/**
 * `queryOptions` for every `qk.catalog` key (Query Migration 1b, #954), 5 min
 * stale. Spread them into `useQuery` and add `enabled` at the call site
 * (`{ ...catalogOptions.staff(), enabled: open }`). The query functions only
 * read.
 */

export function catalogProjectOptionsOptions() {
  return queryOptions<CatalogProjectOption[]>({
    queryKey: qk.catalog.projectOptions(),
    queryFn: () => fetchCatalogProjectOptions({}),
    staleTime: STALE.catalog,
  });
}

export function catalogWorkflowsOptions() {
  return queryOptions<WorkflowRef[]>({
    queryKey: qk.catalog.workflows(),
    queryFn: () => fetchCatalogWorkflows({}),
    staleTime: STALE.catalog,
  });
}

/** Same rows as `catalogWorkflowsOptions`, under `catalog.tramos`. */
export function catalogTramosOptions() {
  return queryOptions<WorkflowRef[]>({
    queryKey: qk.catalog.tramos(),
    queryFn: () => fetchCatalogWorkflows({}),
    staleTime: STALE.catalog,
  });
}

export function catalogTaskStatusesOptions() {
  return queryOptions<TaskStatusOption[]>({
    queryKey: qk.catalog.taskStatuses(),
    queryFn: () => fetchCatalogTaskStatuses({}),
    staleTime: STALE.catalog,
  });
}

export function catalogStaffOptions() {
  return queryOptions<CatalogStaffOption[]>({
    queryKey: qk.catalog.staff(),
    queryFn: () => fetchCatalogStaff({}),
    staleTime: STALE.catalog,
  });
}

export function catalogAssignableStaffOptions(workflowId: string | null) {
  return queryOptions<CatalogAssignableStaffOption[]>({
    queryKey: qk.catalog.assignableStaff(workflowId),
    queryFn: () => fetchCatalogAssignableStaff({ workflowId }),
    staleTime: STALE.catalog,
  });
}

/** `null` when the viewer can't see the project. */
export function catalogProjectSpacesOptions(projectId: string) {
  return queryOptions<ProjectSpace[] | null>({
    queryKey: qk.catalog.projectSpaces(projectId),
    queryFn: () => fetchCatalogProjectSpaces({ projectId }),
    staleTime: STALE.catalog,
  });
}

export function catalogContactsOptions(type?: ContactType) {
  return queryOptions<CatalogContactOption[]>({
    queryKey: qk.catalog.contacts(type),
    queryFn: () => fetchCatalogContacts(type ? { type } : {}),
    staleTime: STALE.catalog,
  });
}

/** The same options, shaped like `qk.catalog`. */
export const catalogOptions = {
  projectOptions: catalogProjectOptionsOptions,
  workflows: catalogWorkflowsOptions,
  tramos: catalogTramosOptions,
  taskStatuses: catalogTaskStatusesOptions,
  staff: catalogStaffOptions,
  assignableStaff: catalogAssignableStaffOptions,
  projectSpaces: catalogProjectSpacesOptions,
  contacts: catalogContactsOptions,
} as const;

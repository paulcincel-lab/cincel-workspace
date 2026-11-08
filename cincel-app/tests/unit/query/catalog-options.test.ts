/**
 * `lib/query/options/catalog.ts` (#954): every option sits on its
 * `qk.catalog` key with the 5 min catalog staleTime and calls its action
 * with the key's input.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => null),
  fetchCatalogContacts: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => actions);

import { catalogOptions } from "@/lib/query/options/catalog";
import { STALE, qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

const WORKFLOW = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => vi.clearAllMocks());

const cases = [
  { name: "projectOptions", opts: () => catalogOptions.projectOptions(), key: qk.catalog.projectOptions(), action: actions.fetchCatalogProjectOptions, input: {} },
  { name: "workflows", opts: () => catalogOptions.workflows(), key: qk.catalog.workflows(), action: actions.fetchCatalogWorkflows, input: {} },
  { name: "tramos", opts: () => catalogOptions.tramos(), key: qk.catalog.tramos(), action: actions.fetchCatalogWorkflows, input: {} },
  { name: "taskStatuses", opts: () => catalogOptions.taskStatuses(), key: qk.catalog.taskStatuses(), action: actions.fetchCatalogTaskStatuses, input: {} },
  { name: "staff", opts: () => catalogOptions.staff(), key: qk.catalog.staff(), action: actions.fetchCatalogStaff, input: {} },
  {
    name: "assignableStaff(workflowId)",
    opts: () => catalogOptions.assignableStaff(WORKFLOW),
    key: qk.catalog.assignableStaff(WORKFLOW),
    action: actions.fetchCatalogAssignableStaff,
    input: { workflowId: WORKFLOW },
  },
  {
    name: "assignableStaff(null)",
    opts: () => catalogOptions.assignableStaff(null),
    key: qk.catalog.assignableStaff(null),
    action: actions.fetchCatalogAssignableStaff,
    input: { workflowId: null },
  },
  {
    name: "projectSpaces",
    opts: () => catalogOptions.projectSpaces(PROJECT),
    key: qk.catalog.projectSpaces(PROJECT),
    action: actions.fetchCatalogProjectSpaces,
    input: { projectId: PROJECT },
  },
  { name: "contacts()", opts: () => catalogOptions.contacts(), key: qk.catalog.contacts(), action: actions.fetchCatalogContacts, input: {} },
  {
    name: "contacts('cliente')",
    opts: () => catalogOptions.contacts("cliente"),
    key: qk.catalog.contacts("cliente"),
    action: actions.fetchCatalogContacts,
    input: { type: "cliente" },
  },
] as const;

describe("catalog query options", () => {
  it.each(cases)("$name: key, staleTime and action input", async ({ opts, key, action, input }) => {
    const options = opts();
    expect(options.queryKey).toEqual(key);
    expect(options.staleTime).toBe(STALE.catalog);

    const client = createTestQueryClient();
    await client.fetchQuery(options as never);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(input);
  });

  it("a second read within staleTime does not call the action again", async () => {
    const client = createTestQueryClient();
    await client.fetchQuery(catalogOptions.staff());
    await client.fetchQuery(catalogOptions.staff());
    expect(actions.fetchCatalogStaff).toHaveBeenCalledTimes(1);
  });
});

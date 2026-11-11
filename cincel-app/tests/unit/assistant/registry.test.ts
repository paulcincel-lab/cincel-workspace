import type { ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/github/client", () => ({
  isGithubConfigured: () => false,
  createGithubIssue: vi.fn(),
}));

import { buildAssistantTools } from "@/lib/assistant/tools";
import { CUTTO_TOOL_NAMES } from "@/lib/assistant/tools/cutto";
import { DEFINED_TOOLS } from "@/lib/assistant/tools/index";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { AssistantContext } from "@/lib/types/redesign";

/** BE §10.2: the 16 tools kept in `lib/assistant/tools.ts`. */
const EXISTING = [
  "list_projects",
  "list_activities_due",
  "team_workload_summary",
  "render_chart",
  "render_card",
  "render_stat_grid",
  "render_list",
  "create_task",
  "assign_task",
  "create_client",
  "onboard_client",
  "create_rfc",
  "find_duplicates",
  "merge_duplicate_clients",
  "merge_duplicate_activities",
  "discard_project",
];

/** BE §10.3: the 65 new tools by group. */
const NEW_BY_GROUP: Record<string, string[]> = {
  consulta: ["search_workspace", "get_project", "get_task", "list_my_tasks"],
  tareas: [
    "update_task_status",
    "reschedule_task",
    "add_task_comment",
    "add_subtask",
    "create_tasks_from_notes",
    "rebalance_workload",
  ],
  agenda: ["list_events", "find_free_slots", "create_event", "update_event", "cancel_event", "schedule_site_visit"],
  cutto: [...CUTTO_TOOL_NAMES],
  notificaciones: [
    "list_notifications",
    "mark_notifications_read",
    "create_reminder",
    "list_reminders",
    "cancel_reminder",
    "notify_people",
    "schedule_digest",
  ],
  correo: ["search_email", "summarize_email_thread", "draft_email", "send_email", "link_email_to_project"],
  miEspacio: ["create_note", "create_checklist", "clock_in", "pause_or_clock_out", "get_my_hours", "team_hours_report"],
  personas: ["get_person", "invite_client_to_portal", "request_client_approval", "request_quotes", "compare_quotes"],
  arquitectura: [
    "measure_areas_from_plan",
    "quantity_takeoff",
    "parametric_cost_estimate",
    "zoning_check",
    "site_photo_log",
    "schedule_from_template",
    "moodboard_from_references",
    "progress_report",
  ],
  widgets: ["render_table", "render_timeline", "render_confirmation"],
};

/** Client visual of approval requests; counted in the catalog, never offered to the model. */
const NOT_MODEL_CALLABLE = ["render_confirmation"];

const NEW = Object.values(NEW_BY_GROUP).flat();

function userWith(access: string): AuthenticatedUser {
  return {
    email: "ana@cincel.mx",
    access,
    member: { id: "staff-1", name: "Ana", role: "", email: "ana@cincel.mx", active: true },
  } as unknown as AuthenticatedUser;
}

const admin = userWith("Administrador");
const context: AssistantContext = { route: "/asistente" };

/** `buildAssistantTools(user, { context, threadId })` (BE §10.1). */
const build = buildAssistantTools as unknown as (
  user: AuthenticatedUser | null,
  run?: { context: AssistantContext; threadId: string },
) => ToolSet;

function offeredDefined(user: AuthenticatedUser): string[] {
  return DEFINED_TOOLS.filter((t) => t.definition.capability(user) && t.definition.available({ user, context })).map(
    (t) => t.name,
  );
}

beforeEach(() => {
  vi.stubEnv("CUTTO_API_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assistant tool catalog (BE §10.2–§10.3)", () => {
  it("totals 81 tools, 15 of them Cutto", () => {
    expect(EXISTING).toHaveLength(16);
    expect(NEW).toHaveLength(65);
    expect(new Set([...EXISTING, ...NEW]).size).toBe(81);
    expect(NEW_BY_GROUP.cutto).toHaveLength(15);
    expect(NEW_BY_GROUP.widgets).toHaveLength(3);
  });

  it("registers every model-callable new tool exactly once", () => {
    const registered = DEFINED_TOOLS.map((t) => t.name);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual(NEW.filter((n) => !NOT_MODEL_CALLABLE.includes(n)).sort());
  });

  it("does not re-register a kept tool or render_confirmation", () => {
    const registered = new Set(DEFINED_TOOLS.map((t) => t.name));
    for (const name of [...EXISTING, ...NOT_MODEL_CALLABLE]) expect(registered.has(name), name).toBe(false);
  });

  it("registers all 15 Cutto tools", () => {
    const registered = new Set(DEFINED_TOOLS.map((t) => t.name));
    for (const name of CUTTO_TOOL_NAMES) expect(registered.has(name), name).toBe(true);
  });
});

describe("capability gating", () => {
  it("offers render_table and render_timeline to every staff member", () => {
    for (const access of ["Administrador", "Dirección", "Colaborador"]) {
      const offered = offeredDefined(userWith(access));
      expect(offered, access).toContain("render_table");
      expect(offered, access).toContain("render_timeline");
    }
  });

  it("offers no Cutto tool while CUTTO_API_URL is unset", () => {
    const offered = new Set(offeredDefined(admin));
    for (const name of CUTTO_TOOL_NAMES) expect(offered.has(name), name).toBe(false);
  });

  it("offers the Cutto tools by capability once CUTTO_API_URL is set", () => {
    vi.stubEnv("CUTTO_API_URL", "https://api.cutto.test");
    const forAdmin = new Set(offeredDefined(admin));
    for (const name of CUTTO_TOOL_NAMES) expect(forAdmin.has(name), name).toBe(true);
    // **lead** only.
    expect(offeredDefined(userWith("Colaborador"))).not.toContain("create_project_channel");
  });
});

describe("buildAssistantTools", () => {
  const run = { context, threadId: "thread-1" };

  it("leaves out all 15 Cutto tools without CUTTO_API_URL", () => {
    const names = Object.keys(build(admin, run));
    for (const name of CUTTO_TOOL_NAMES) expect(names, name).not.toContain(name);
    expect(names).toContain("render_table");
    expect(names).toContain("render_timeline");
    expect(names).not.toContain("render_confirmation");
  });

  it("includes the Cutto tools with CUTTO_API_URL set", () => {
    vi.stubEnv("CUTTO_API_URL", "https://api.cutto.test");
    const tools = build(admin, run);
    for (const name of CUTTO_TOOL_NAMES) expect(Object.keys(tools), name).toContain(name);
    expect(tools.send_message.needsApproval).toBe(true);
    expect(tools.join_voice_room.needsApproval ?? false).toBe(false);
  });
});

import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { keysForToolParts, TOOL_INVALIDATIONS } from "@/lib/assistant/tool-invalidation";
import { qk } from "@/lib/query/keys";

type Part = UIMessage["parts"][number];

function done(tool: string, output: unknown = { ok: true }): Part {
  return { type: `tool-${tool}`, toolCallId: `call-${tool}`, state: "output-available", input: {}, output } as Part;
}

const REMINDERS_PREFIX = ["me", "reminders"];

describe("keysForToolParts", () => {
  it.each([
    ["create_note", [qk.me.notes()]],
    ["create_checklist", [qk.me.checklists()]],
    ["create_reminder", [REMINDERS_PREFIX, qk.shell.badges(), qk.inicio()]],
    ["cancel_reminder", [REMINDERS_PREFIX, qk.shell.badges(), qk.inicio()]],
    ["clock_in", [qk.me.today()]],
    ["pause_or_clock_out", [qk.me.today()]],
    ["create_task", [qk.tareas.all, qk.inicio(), qk.shell.badges(), qk.me.tasks(), qk.calendario.all]],
    ["update_task_status", [qk.tareas.all, qk.inicio(), qk.shell.badges(), qk.me.tasks()]],
    ["create_tasks_from_notes", [qk.tareas.all, qk.inicio(), qk.shell.badges(), qk.me.tasks()]],
    ["create_event", [INICIO, qk.calendario.all]],
    ["send_email", [qk.me.gmail.all]],
    ["draft_email", [qk.me.gmail.all]],
    ["invite_client_to_portal", [qk.proyectos.all]],
    ["request_client_approval", [qk.proyectos.all]],
    ["mark_notifications_read", [["me", "notifications"], qk.me.notificationsSummary(), qk.shell.badges()]],
    ["schedule_digest", [qk.me.notificationPrefs(), qk.me.preferences()]],
    ["site_photo_log", [qk.proyectos.all]],
    [
      "discard_project",
      [qk.proyectos.all, qk.tareas.all, qk.inicio(), qk.shell.badges(), qk.me.tasks(), qk.catalog.projectOptions(), qk.me.today()],
    ],
  ])("%s", (tool, expected) => {
    expect(keysForToolParts([done(tool)])).toEqual(expected);
  });

  it("maps every listed tool to at least one key", () => {
    for (const tool of Object.keys(TOOL_INVALIDATIONS)) {
      expect(keysForToolParts([done(tool)]).length, tool).toBeGreaterThan(0);
    }
  });

  it("reads dynamic-tool parts by toolName", () => {
    const part = { type: "dynamic-tool", toolName: "create_note", toolCallId: "c1", state: "output-available", input: {}, output: {} };
    expect(keysForToolParts([part as Part])).toEqual([qk.me.notes()]);
  });

  it("skips read-only tools, text parts and unknown tools", () => {
    const parts = [
      { type: "text", text: "Listo" } as Part,
      done("list_my_tasks"),
      done("search_workspace"),
      done("render_chart"),
      done("create_event"),
      done("move_tasks"),
      done("not_a_tool"),
    ];
    expect(keysForToolParts(parts)).toEqual([]);
  });

  it("skips calls that did not finish or reported a failure", () => {
    const parts = [
      { type: "tool-create_note", toolCallId: "a", state: "input-available", input: {} } as Part,
      { type: "tool-create_note", toolCallId: "b", state: "approval-requested", input: {}, approval: { id: "x" } } as unknown as Part,
      { type: "tool-create_note", toolCallId: "c", state: "output-denied", input: {}, approval: { id: "y", approved: false } } as unknown as Part,
      { type: "tool-create_note", toolCallId: "d", state: "output-error", input: {}, errorText: "boom" } as Part,
      done("create_task", { ok: false, error: "FORBIDDEN" }),
    ];
    expect(keysForToolParts(parts)).toEqual([]);
  });

  it("dedupes keys across tool families, first seen first", () => {
    const keys = keysForToolParts([done("create_reminder"), done("create_task"), done("create_note"), done("create_task")]);
    expect(keys).toEqual([REMINDERS_PREFIX, qk.shell.badges(), qk.inicio(), qk.tareas.all, qk.me.tasks(), qk.calendario.all, qk.me.notes()]);
  });

  it("is empty for no parts", () => {
    expect(keysForToolParts(undefined)).toEqual([]);
    expect(keysForToolParts([])).toEqual([]);
  });
});

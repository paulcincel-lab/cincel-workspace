// @vitest-environment node
/**
 * Eval-style check of `extract_minutes` (BE §11.2, §17) with a mocked provider: the recorded
 * answer for the canvas notes gives 1 decision, 4 tasks with owners and dates and a follow-up
 * on 25 nov. No live model in CI.
 */
import { generateObject } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { buildMinutesProposal, minutesIdOfChanges, resolveDue, type MinutesMeeting } from "@/lib/calendario/minutes";
import { ExtractedMinutesSchema } from "@/lib/validation/calendario";

const MINUTES_ID = "8f1d6a40-1c11-4f6e-9b1b-3d2f0a4c9e01";
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";

const NOTES = `Se decide la cocina en cuarzo blanco.
Ana envía los planos el 13 de noviembre. Luis revisa la cotización el 16 de noviembre.
Yo confirmo la visita de obra el 18 de noviembre. Marcos manda las muestras el 20 de noviembre.
Junta de seguimiento con el cliente el 25 de noviembre.`;

const RECORDED = {
  decisions: ["Cocina en cuarzo blanco"],
  tasks: [
    { title: "Enviar planos actualizados", owner: "Ana", due: "2026-11-13" },
    { title: "Revisar la cotización", owner: "Luis", due: "2026-11-16" },
    { title: "Confirmar la visita de obra", owner: "yo", due: "2026-11-18" },
    { title: "Mandar las muestras", owner: "Marcos", due: "2026-11-20" },
  ],
  followUp: { date: "2026-11-25" },
  openPoints: ["Acabado de la cocina"],
};

function mockModel(object: unknown) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(object) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const meeting: MinutesMeeting = {
  title: "Junta con el cliente",
  date: "2026-11-11",
  hour: 10,
  minute: 0,
  durationMinutes: 60,
  projectId: PROJECT,
  hasMeetLink: true,
  attendees: [
    { staffId: ANA, email: "ana@example.test", name: "Ana García" },
    { staffId: LUIS, email: "luis@example.test", name: "Luis Martínez" },
  ],
};

const people: Record<string, string> = { ana: ANA, luis: LUIS };
const resolveOwner = (name: string) => people[name.toLowerCase()] ?? null;

async function extract() {
  const model = mockModel(RECORDED);
  const result = await generateObject({ model, schema: ExtractedMinutesSchema, system: "s", prompt: NOTES });
  return { model, extracted: result.object };
}

describe("extract_minutes with a mocked provider", () => {
  it("gives 1 decision, 4 tasks with owners and dates and the follow-up on 25 nov", async () => {
    const { model, extracted } = await extract();
    expect(model.doGenerateCalls).toHaveLength(1);
    const built = buildMinutesProposal({ minutesId: MINUTES_ID, meeting, extracted, resolveOwner, viewerId: ME, canChangeResponsible: true });

    expect(built.changes.filter((c) => c.type === "decision")).toHaveLength(1);
    const tasks = built.changes.filter((c) => c.type === "task_create");
    expect(tasks).toHaveLength(4);
    expect(tasks.map((c) => (c.type === "task_create" ? c.draft.managerId : null))).toEqual([ANA, LUIS, ME, null]);
    expect(tasks.map((c) => (c.type === "task_create" ? c.draft.commitmentDate : null))).toEqual([
      "2026-11-13",
      "2026-11-16",
      "2026-11-18",
      "2026-11-20",
    ]);
    const followUp = built.changes.find((c) => c.type === "event_create");
    expect(followUp?.type === "event_create" && followUp.draft.start.startsWith("2026-11-25T16:00")).toBe(true);
    expect(followUp?.type === "event_create" && followUp.draft.projectId).toBe(PROJECT);
    expect(built.line).toBe("1 decisión, 4 tareas y una junta de seguimiento el 25 nov.");
    expect(built.openPoints).toEqual(["Acabado de la cocina"]);
    expect(minutesIdOfChanges(built.changes)).toBe(MINUTES_ID);
  });

  it("marks an owner that matches nobody as Sin responsable", async () => {
    const { extracted } = await extract();
    const built = buildMinutesProposal({ minutesId: MINUTES_ID, meeting, extracted, resolveOwner, viewerId: ME, canChangeResponsible: true });
    const last = built.changes.filter((c) => c.type === "task_create").at(-1);
    expect(last?.type === "task_create" && last.draft.sourceText).toContain("Sin responsable");
    expect(last?.type === "task_create" && last.draft.sourceText).toContain("Marcos");
  });

  it("owns the tasks by the viewer with 'Te la asigno a ti' without assign permission", async () => {
    const { extracted } = await extract();
    const built = buildMinutesProposal({ minutesId: MINUTES_ID, meeting, extracted, resolveOwner, viewerId: ME, canChangeResponsible: false });
    const [ana, luis] = built.changes.filter((c) => c.type === "task_create");
    expect(ana.type === "task_create" && ana.draft.managerId).toBe(ME);
    expect(ana.type === "task_create" && ana.draft.sourceText).toContain("Te la asigno a ti");
    expect(luis.type === "task_create" && luis.draft.managerId).toBe(ME);
  });

  it("creates no tasks for a meeting without project but keeps the decisions", async () => {
    const { extracted } = await extract();
    const built = buildMinutesProposal({
      minutesId: MINUTES_ID,
      meeting: { ...meeting, projectId: null },
      extracted,
      resolveOwner,
      viewerId: ME,
      canChangeResponsible: true,
    });
    expect(built.changes.some((c) => c.type === "task_create")).toBe(false);
    expect(built.changes.some((c) => c.type === "decision")).toBe(true);
    expect(built.line).toContain("Vincula la reunión a un proyecto");
  });
});

describe("resolveDue", () => {
  it("keeps a valid ISO date and drops an invalid one", () => {
    expect(resolveDue("2026-11-13", "2026-11-11")).toBe("2026-11-13");
    expect(resolveDue("2026-02-31", "2026-11-11")).toBeNull();
    expect(resolveDue(null, "2026-11-11")).toBeNull();
    expect(resolveDue("  ", "2026-11-11")).toBeNull();
  });
});

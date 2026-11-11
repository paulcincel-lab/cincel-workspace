// @vitest-environment node
/**
 * Eval-style check of the system prompt (#1055) with a mocked provider: no
 * live model in CI. It asserts what the model receives (the system prompt
 * allows general architecture knowledge) and replays a recorded answer to the
 * question that used to get "No tengo esa información".
 */
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { buildSystemPrompt, SYSTEM_PROMPT, type AssistantToolInfo } from "@/lib/assistant/prompt";

/** Recorded answers (written by hand from the expected content; the live check is in the PR). */
const RECORDED: Record<string, string> = {
  "dame la altura de un lavabo":
    "Como referencia general (no es un dato de un proyecto de Cincel), un lavabo se coloca con el borde superior a unos 80–85 cm del piso terminado. En baños accesibles el borde va a 76–80 cm como máximo, con un espacio libre debajo de unos 70 cm para las rodillas, según la NMX-R-050-SCFI y las Normas Técnicas Complementarias del Reglamento de Construcciones de la Ciudad de México. La altura exacta puede variar según el reglamento local y el fabricante del lavabo.",
  "ancho mínimo de una puerta accesible":
    "Como referencia general, una puerta accesible necesita un claro libre mínimo de 90 cm (NTC para el Proyecto Arquitectónico del Reglamento de Construcciones de la Ciudad de México y NMX-R-050-SCFI). Revisa el reglamento local que aplique a cada proyecto.",
};

function answering(text: string) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const TOOLS: AssistantToolInfo[] = [
  { name: "search_workspace", description: "Busca en Cincel proyectos, tareas, personas, archivos y tus notas.", write: false },
  { name: "get_project", description: "Consulta un proyecto: estatus, avance y tramo actual.", write: false },
];

function systemOf(model: MockLanguageModelV4): string {
  const message = model.doGenerateCalls[0]?.prompt.find((m) => m.role === "system");
  return message && typeof message.content === "string" ? message.content : "";
}

describe("general-knowledge questions are not refused", () => {
  for (const [question, answer] of Object.entries(RECORDED)) {
    it(question, async () => {
      const model = answering(answer);
      const result = await generateText({
        model,
        system: buildSystemPrompt({ tools: TOOLS }),
        messages: [{ role: "user", content: question }],
      });

      const system = systemOf(model);
      expect(system).toContain("Conocimiento general de arquitectura, diseño y construcción");
      expect(system).toContain("No contestes «no tengo esa información» a una pregunta de conocimiento general.");
      expect(system).toContain("Normas Técnicas Complementarias");
      expect(system).not.toContain("explica amablemente que no tienes esa información");

      expect(result.text).not.toMatch(/no tengo esa información/i);
      expect(result.text).toContain("referencia general");
      expect(result.text).toMatch(/Reglamento de Construcciones|NMX-R-050/);
    });
  }

  it("the sink answer gives the usual height and the accessible note", () => {
    const text = RECORDED["dame la altura de un lavabo"];
    expect(text).toMatch(/80[–-]85 cm/);
    expect(text).toMatch(/accesibles/);
  });
});

describe("project questions still go to the tools", () => {
  it("tells the model to look in the project first, then fall back to the general reference", () => {
    expect(SYSTEM_PROMPT).toContain("primero búscalo con las herramientas");
    expect(SYSTEM_PROMPT).toContain("Para esto usa siempre las herramientas; nunca inventes");
  });
});

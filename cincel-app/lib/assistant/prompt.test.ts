import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import { buildSystemPrompt, shortDescription, SYSTEM_PROMPT, type AssistantToolInfo } from "./prompt";

function user(
  name: string,
  access: SystemAccessRole,
  area = ""
): AuthenticatedUser {
  return {
    member: {
      id: "1",
      name,
      role: access,
      area,
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "u@cincel.mx",
      phone: "",
    },
    email: "u@cincel.mx",
    access,
  };
}

function tool(name: string, write = false, description = `Descripción de ${name}.`): AssistantToolInfo {
  return { name, description, write };
}

describe("buildSystemPrompt", () => {
  it("names the acting user and their role", () => {
    const p = buildSystemPrompt({
      tools: [],
      user: user("Ana Ruiz", "Arquitecto Senior", "Diseño"),
    });
    expect(p).toContain("Ana Ruiz");
    expect(p).toContain("Arquitecto Senior");
    expect(p).toContain("área Diseño");
  });

  it("omits the identity section when no user is given", () => {
    expect(buildSystemPrompt({ tools: [] })).not.toContain("Estás asistiendo a");
  });

  it("falls back to the email when the member has no name", () => {
    const u = user("", "Colaborador");
    expect(buildSystemPrompt({ tools: [], user: u })).toContain("u@cincel.mx");
  });

  it("describes write actions only when the matching tools are present", () => {
    const withWrite = buildSystemPrompt({
      tools: [tool("create_task", true), tool("assign_task", true)],
      user: user("Ana", "Administrador"),
    });
    expect(withWrite).toContain("create_task");
    expect(withWrite).toContain("assign_task");

    const readOnly = buildSystemPrompt({ tools: [], user: user("Ana", "Colaborador") });
    expect(readOnly).toContain("no puedes crear ni modificar nada");
  });

  it("SYSTEM_PROMPT is the read-only, no-user variant", () => {
    expect(SYSTEM_PROMPT).not.toContain("Estás asistiendo a");
    expect(SYSTEM_PROMPT).toContain("Cincel");
  });

  it("lists exactly the tools it is given, reads apart from writes, without the widgets", () => {
    const p = buildSystemPrompt({
      tools: [
        tool("get_project", false, "Consulta un proyecto: estatus y avance. Sin nombre usa el de la página."),
        tool("create_note", true, "Crea una nota personal."),
        tool("render_table", false, "Renderiza una tabla."),
      ],
    });
    const reads = p.slice(p.indexOf("Herramientas de consulta"), p.indexOf("Herramientas que cambian"));
    expect(reads).toContain("- get_project: Consulta un proyecto: estatus y avance.");
    expect(reads).not.toContain("Sin nombre usa");
    expect(p.slice(p.indexOf("Herramientas que cambian"))).toContain("- create_note: Crea una nota personal.");
    expect(p).not.toContain("- render_table:");
    expect(p).toContain("→ render_table");
    expect(p).not.toContain("render_chart");
    expect(p).not.toContain("list_projects");
  });

  it("adds a tool's extra rule only when the tool is present", () => {
    expect(buildSystemPrompt({ tools: [tool("discard_project", true)] })).toContain("restaurar durante 30 días");
    expect(buildSystemPrompt({ tools: [] })).not.toContain("discard_project");
  });

  it("points 'mis tareas' at list_my_tasks when the user has it", () => {
    const u = user("Ana", "Colaborador");
    expect(buildSystemPrompt({ tools: [tool("list_my_tasks")], user: u })).toContain("usa list_my_tasks");
    expect(buildSystemPrompt({ tools: [tool("list_activities_due")], user: u })).toContain("filtra list_activities_due por su nombre (Ana)");
  });

  it("allows general architecture knowledge and keeps Cincel data on the tools", () => {
    expect(SYSTEM_PROMPT).toContain("Conocimiento general de arquitectura");
    expect(SYSTEM_PROMPT).toContain("Reglamento de Construcciones de la Ciudad de México");
    expect(SYSTEM_PROMPT).toContain("referencia general");
    expect(SYSTEM_PROMPT).toContain("nunca inventes");
    expect(SYSTEM_PROMPT).not.toContain("explica amablemente que no tienes esa información");
  });

  it("keeps the safety rules with server threads", () => {
    const p = buildSystemPrompt({ tools: [], serverThreads: true });
    expect(p).toContain('"untrusted": true');
    expect(p).toContain("no pidas un \"sí\" por texto");
    expect(p).toContain("contraseñas");
  });
});

describe("shortDescription", () => {
  it("keeps the first sentence", () => {
    expect(shortDescription("Lista tareas. Filtra por estatus.")).toBe("Lista tareas.");
  });

  it("doesn't cut at an abbreviation", () => {
    expect(shortDescription("Renderiza una lista (p. ej. qué subtareas faltan) corta. Otra.")).toBe(
      "Renderiza una lista (p. ej. qué subtareas faltan) corta.",
    );
  });

  it("caps long sentences at a word", () => {
    const out = shortDescription(`${"palabra ".repeat(60)}fin.`, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });
});

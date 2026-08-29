import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import { buildSystemPrompt, SYSTEM_PROMPT } from "./prompt";

function user(
  name: string,
  access: SystemAccessRole,
  area = ""
): AuthenticatedUser {
  return {
    member: {
      id: 1,
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

describe("buildSystemPrompt", () => {
  it("names the acting user and their role", () => {
    const p = buildSystemPrompt({
      toolNames: [],
      user: user("Ana Ruiz", "Arquitecto Senior", "Diseño"),
    });
    expect(p).toContain("Ana Ruiz");
    expect(p).toContain("Arquitecto Senior");
    expect(p).toContain("área Diseño");
  });

  it("omits the identity section when no user is given", () => {
    expect(buildSystemPrompt({ toolNames: [] })).not.toContain("Estás asistiendo a");
  });

  it("falls back to the email when the member has no name", () => {
    const u = user("", "Colaborador");
    expect(buildSystemPrompt({ toolNames: [], user: u })).toContain("u@cincel.mx");
  });

  it("describes write actions only when the matching tools are present", () => {
    const withWrite = buildSystemPrompt({
      toolNames: ["create_task", "assign_task"],
      user: user("Ana", "Administrador"),
    });
    expect(withWrite).toContain("create_task");
    expect(withWrite).toContain("assign_task");

    const readOnly = buildSystemPrompt({ toolNames: [], user: user("Ana", "Colaborador") });
    expect(readOnly).toContain("no puedes crear ni modificar nada");
  });

  it("SYSTEM_PROMPT is the read-only, no-user variant", () => {
    expect(SYSTEM_PROMPT).not.toContain("Estás asistiendo a");
    expect(SYSTEM_PROMPT).toContain("Cincel");
  });
});

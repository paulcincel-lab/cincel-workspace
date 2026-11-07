import { describe, expect, it } from "vitest";

import { actionErrorCode, actionErrorText } from "./errors";

describe("actionErrorCode", () => {
  it("reads the code from 'CODE' and 'CODE: detail' messages", () => {
    expect(actionErrorCode(new Error("PHASE_MISMATCH"))).toBe("PHASE_MISMATCH");
    expect(actionErrorCode(new Error("SPACE_MISMATCH: space 1 is of project 2"))).toBe("SPACE_MISMATCH");
    expect(actionErrorCode("INVALID")).toBe("INVALID");
    expect(actionErrorCode({ ok: false, error: "EXPORT_MISSING" })).toBe("EXPORT_MISSING");
  });

  it("returns an empty code for other errors", () => {
    expect(actionErrorCode(new Error("[Cincel] updateTask: boom"))).toBe("");
    expect(actionErrorCode(null)).toBe("");
  });
});

describe("actionErrorText", () => {
  it("maps PHASE_MISMATCH", () => {
    expect(actionErrorText(new Error("PHASE_MISMATCH"))).toBe("Esa fase no pertenece al tramo de la tarea.");
  });

  it("maps SPACE_MISMATCH", () => {
    expect(actionErrorText(new Error("SPACE_MISMATCH: detail"))).toBe("Ese espacio es de otro proyecto.");
  });

  it("maps INVALID to the generic copy, or the status copy in that context", () => {
    expect(actionErrorText(new Error("INVALID"))).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(actionErrorText(new Error("INVALID"), { invalid: "status" })).toBe(
      "Solo un estatus que cierra la tarea puede contar como completado.",
    );
  });

  it("maps NAME_TAKEN by entity", () => {
    expect(actionErrorText(new Error("NAME_TAKEN"))).toBe("Ya existe un proyecto con ese nombre.");
    expect(actionErrorText(new Error("NAME_TAKEN"), { entity: "space" })).toBe("Ya existe un espacio con ese nombre.");
    expect(actionErrorText(new Error("NAME_TAKEN"), { entity: "template", phaseName: "Ejecutivo" })).toBe(
      "Ya existe una tarea de plantilla con ese nombre en Ejecutivo.",
    );
  });

  it("maps ADMIN_TASK and TOUCHED", () => {
    expect(actionErrorText(new Error("ADMIN_TASK"))).toBe("Las tareas de administración no tienen fase ni espacio.");
    expect(actionErrorText(new Error("TOUCHED"), { tramoName: "Diseño" })).toBe(
      "No se puede deshacer: ya se editó una de las tareas creadas o Diseño se inició de nuevo después.",
    );
  });

  it("falls back to the generic copy", () => {
    expect(actionErrorText(new Error("boom"))).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
});

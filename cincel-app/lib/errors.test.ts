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

  it("maps INVALID and RATE_LIMITED in the search context", () => {
    expect(actionErrorText(new Error("INVALID: query"), "search")).toBe("Escribe al menos 2 letras.");
    expect(actionErrorText(new Error("RATE_LIMITED"), "search")).toBe(
      "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.",
    );
    expect(actionErrorText(new Error("boom"), "search")).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });

  it("maps the photo upload codes", () => {
    expect(actionErrorText(new Error("TOO_LARGE"), "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
    expect(actionErrorText(new Error("INVALID_TYPE"), "photo")).toBe("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
  });

  it("falls back to the generic copy", () => {
    expect(actionErrorText(new Error("boom"))).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
  it("maps every redesign code (FE §9)", () => {
    const cases: Array<[string, string]> = [
      ["OVERRIDE_DISABLED", "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie."],
      ["LOW_CONTRAST", "Algunos textos no se leerían bien (contraste menor a 4.5:1). Ajusta los colores marcados."],
      ["INVALID_TYPE", "Ese archivo no es una imagen. Usa JPG, PNG o WebP."],
      ["PAST_TIME", "Esa fecha ya pasó. Elige una hora futura."],
      ["NOT_CONNECTED", "Gmail no está conectado. Conéctalo en Ajustes › Gmail, calendario y Cutto."],
      ["SCOPE_MISSING", "Falta dar permiso para leer el correo. Vuelve a conectar Gmail."],
      ["CONFIRM_REQUIRED", "Confirma el envío antes de continuar."],
      ["EXPIRED", "Esta confirmación venció. Vuelve a intentarlo."],
      ["ALREADY_ON", "Ya registraste tu entrada hoy."],
      ["NOT_ON", "Tu jornada no está en curso."],
      ["DISABLED", "Esta función está desactivada."],
      ["OVERLAP", "Ya tienes una solicitud en esas fechas."],
      ["NOT_IMPLEMENTED", "Esta función todavía no está disponible."],
      ["RATE_LIMITED", "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
      ["STARTED", "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó."],
      ["TOO_LARGE", "La imagen pesa más de 2 MB. Elige una más ligera."],
    ];
    for (const [code, copy] of cases) expect(actionErrorText(new Error(`${code}: detail`))).toBe(copy);
  });

  it("picks the copy by redesign context", () => {
    expect(actionErrorText(new Error("INVALID"), "search")).toBe("Escribe al menos 2 letras.");
    expect(actionErrorText(new Error("RATE_LIMITED"), "gmail")).toBe(
      "Se sincronizó hace un momento. Intenta de nuevo en unos minutos.",
    );
    expect(actionErrorText(new Error("RATE_LIMITED"), "photo")).toBe(
      "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.",
    );
    expect(actionErrorText(new Error("DISABLED"), "redesign")).toBe("El nuevo diseño no está disponible por ahora.");
    expect(actionErrorText(new Error("DISABLED"), "cutto")).toBe(
      "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto.",
    );
  });

  it("maps HTTP statuses from the photo route", () => {
    expect(actionErrorText(413, "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
    expect(actionErrorText(415, "photo")).toBe("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
    expect(actionErrorText(500, "photo")).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
});

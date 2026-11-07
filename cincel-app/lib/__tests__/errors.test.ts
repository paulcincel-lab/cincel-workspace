import { describe, expect, it } from "vitest";

import { actionErrorCode, actionErrorText } from "../errors";

const GENERIC = "No se pudo completar la acción. Intenta de nuevo.";

describe("actionErrorText input shapes", () => {
  it("accepts an Error", () => {
    expect(actionErrorText(new Error("NOT_IMPLEMENTED"))).toBe("Esta función todavía no está disponible.");
  });

  it("accepts a 'CODE: detail' string", () => {
    expect(actionErrorText("OVERLAP: 2026-12-01..2026-12-05")).toBe("Ya tienes una solicitud en esas fechas.");
  });

  it("accepts an Error with 'CODE: detail'", () => {
    expect(actionErrorText(new Error("STARTED: request 12"))).toBe(
      "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó.",
    );
  });

  it("accepts an HTTP status from the photo route", () => {
    expect(actionErrorText(413, "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
    expect(actionErrorText(415, "photo")).toBe("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
    expect(actionErrorText(429, "photo")).toBe("Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.");
    expect(actionErrorText(401, "photo")).toBe("No tienes permiso para realizar esta acción.");
  });

  it("accepts a response-like { status }", () => {
    expect(actionErrorText({ status: 413 }, "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
  });

  it("prefers a body { error } code over the status", () => {
    expect(actionErrorCode({ status: 400, error: "TOO_LARGE" })).toBe("TOO_LARGE");
  });

  it("maps unknown statuses and messages to the generic copy", () => {
    expect(actionErrorText(500)).toBe(GENERIC);
    expect(actionErrorText(new Error("boom"))).toBe(GENERIC);
    expect(actionErrorText(undefined)).toBe(GENERIC);
  });

  it("keeps Project Flow's object context", () => {
    expect(actionErrorText(new Error("INVALID"), { invalid: "status" })).toBe(
      "Solo un estatus que cierra la tarea puede contar como completado.",
    );
    expect(actionErrorText(new Error("DISABLED"), { area: "cutto" })).toBe(
      "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto.",
    );
  });
});

describe("actionErrorText codes (FE §9)", () => {
  const cases: Array<[string, Parameters<typeof actionErrorText>[1] | undefined, string]> = [
    ["FORBIDDEN", undefined, "No tienes permiso para realizar esta acción."],
    ["NOT_FOUND", undefined, "Ya no existe. Recarga la página."],
    ["INVALID", undefined, "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo."],
    ["INVALID", "search", "Escribe al menos 2 letras."],
    ["INVALID", "photo", "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo."],
    [
      "OVERRIDE_DISABLED",
      undefined,
      "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie.",
    ],
    [
      "LOW_CONTRAST",
      undefined,
      "Algunos textos no se leerían bien (contraste menor a 4.5:1). Ajusta los colores marcados.",
    ],
    ["INVALID_TYPE", undefined, "Ese archivo no es una imagen. Usa JPG, PNG o WebP."],
    ["PAST_TIME", undefined, "Esa fecha ya pasó. Elige una hora futura."],
    ["NOT_CONNECTED", "gmail", "Gmail no está conectado. Conéctalo en Ajustes › Gmail, calendario y Cutto."],
    ["SCOPE_MISSING", "gmail", "Falta dar permiso para leer el correo. Vuelve a conectar Gmail."],
    ["CONFIRM_REQUIRED", undefined, "Confirma el envío antes de continuar."],
    ["EXPIRED", undefined, "Esta confirmación venció. Vuelve a intentarlo."],
    ["ALREADY_ON", undefined, "Ya registraste tu entrada hoy."],
    ["NOT_ON", undefined, "Tu jornada no está en curso."],
    ["DISABLED", undefined, "Esta función está desactivada."],
    ["DISABLED", "redesign", "El nuevo diseño no está disponible por ahora."],
    ["DISABLED", "cutto", "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto."],
    ["OVERLAP", "vacations", "Ya tienes una solicitud en esas fechas."],
    ["NOT_IMPLEMENTED", undefined, "Esta función todavía no está disponible."],
    ["RATE_LIMITED", "gmail", "Se sincronizó hace un momento. Intenta de nuevo en unos minutos."],
    ["RATE_LIMITED", "search", "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
    ["RATE_LIMITED", "photo", "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
    ["RATE_LIMITED", undefined, "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
    [
      "STARTED",
      "vacations",
      "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó.",
    ],
    ["TOO_LARGE", "photo", "La imagen pesa más de 2 MB. Elige una más ligera."],
  ];

  it.each(cases)("%s (%s)", (code, context, copy) => {
    expect(actionErrorText(new Error(code), context)).toBe(copy);
    expect(actionErrorText(`${code}: detail`, context)).toBe(copy);
  });
});

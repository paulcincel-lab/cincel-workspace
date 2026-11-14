import { describe, expect, it } from "vitest";

import { contextRows, errorPagePrefill, validateDraft } from "./reportar";

const valid = { kind: "error", title: "Falla al guardar", description: "No guarda", steps: null } as const;

describe("validateDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateDraft(valid)).toEqual({});
  });

  it("requires a title of 4 to 120 characters", () => {
    expect(validateDraft({ ...valid, title: "abc" }).title).toBe("El título debe tener al menos 4 caracteres.");
    expect(validateDraft({ ...valid, title: "a".repeat(121) }).title).toBe("El título no puede pasar de 120 caracteres.");
    expect(validateDraft({ ...valid, title: "a".repeat(120) }).title).toBeUndefined();
  });

  it("requires the description", () => {
    expect(validateDraft({ ...valid, description: "   " }).description).toBe("Cuéntanos qué pasó.");
  });
});

describe("errorPagePrefill", () => {
  it("fills kind, title and the digest", () => {
    const prefill = errorPagePrefill("/tareas", "abc123");
    expect(prefill.kind).toBe("error");
    expect(prefill.title).toBe("Error al cargar /tareas");
    expect(prefill.description).toContain("Código del error: abc123");
    expect(prefill.description).toContain("Página: /tareas");
  });

  it("omits the digest line when there is none", () => {
    expect(errorPagePrefill("/", undefined).description).toBe("Página: /");
  });
});

describe("contextRows", () => {
  it("lists what is sent", () => {
    const rows = contextRows(
      { path: "/inicio", estilo: "", theme: "dark", viewport: "390x800", userAgent: "x" },
      null,
    );
    expect(rows.map((r) => r.value)).toEqual(["/inicio", "predeterminado", "oscuro", "desarrollo", "390x800"]);
  });
});

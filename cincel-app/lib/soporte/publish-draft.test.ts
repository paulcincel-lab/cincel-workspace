// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildPublishDraft, draftLabels, type PublishDraftSource } from "@/lib/soporte/publish-draft";
import type { RedactionContext } from "@/lib/soporte/redact";

const redaction: RedactionContext = {
  staffNames: ["Juan Pérez"],
  contactNames: [],
  clientNames: ["Constructora Horizonte"],
  projectNames: ["Casa del Lago"],
};

const source: PublishDraftSource = {
  kind: "error",
  title: "Falla al guardar en Casa del Lago",
  description: "Juan Pérez (juan@correo.com) no puede guardar la etapa de Constructora Horizonte.",
  steps: "1. Abrir el proyecto\n2. Guardar",
  area: "proyectos",
  context: {
    path: "/proyectos/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab/tareas?x=1",
    estilo: "visual",
    theme: "azul",
    viewport: "1280x800",
    userAgent: "x",
    appVersion: "0.4.0",
    occurredAt: "2026-11-13T10:00:00.000Z",
  },
};

describe("buildPublishDraft", () => {
  const draft = buildPublishDraft(source, redaction);

  it("follows the Problema, Propuesta, Contexto técnico template", () => {
    const headings = draft.body.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## Problema", "## Propuesta", "## Contexto técnico"]);
    expect(draft.body).toContain("Pasos para reproducirlo:");
  });

  it("redacts the title and the body", () => {
    expect(draft.title).toBe("Falla al guardar en [proyecto]");
    expect(draft.body).not.toMatch(/Juan|Horizonte|juan@correo/);
    expect(draft.body).toContain("[persona]");
    expect(draft.body).toContain("[cliente]");
    expect(draft.redacted).toBe(true);
  });

  it("keeps only the shape of the path", () => {
    expect(draft.body).toContain("- Ruta: /proyectos/:id/tareas");
    expect(draft.body).not.toContain("x=1");
  });

  it("labels rfc plus the kind", () => {
    expect(draft.labels).toEqual(["rfc", "error"]);
    expect(draftLabels("mejora")).toEqual(["rfc", "mejora"]);
  });

  it("reports no redaction for a clean solicitud", () => {
    const clean = buildPublishDraft({ ...source, title: "Falla al guardar", description: "No guarda.", steps: null }, redaction);
    expect(clean.redacted).toBe(false);
    expect(clean.body).not.toContain("Pasos para reproducirlo");
  });
});

describe("publishErrorText", () => {
  it("has inline copy for the publishing errors and none for the rest", async () => {
    const { publishErrorText } = await import("@/lib/soporte/publish-draft");
    expect(publishErrorText("GITHUB_NOT_CONFIGURED")).toBe("GitHub no está configurado.");
    expect(publishErrorText("ALREADY_PUBLISHED")).toMatch(/ya se publicó/);
    expect(publishErrorText("FORBIDDEN")).toBeNull();
  });
});

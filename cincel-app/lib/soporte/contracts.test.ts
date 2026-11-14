// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createTicketAction, listMyTicketsAction } from "@/lib/actions/soporte-actions";
import { canManageSupport } from "@/lib/auth/permissions";
import { MEJORAS_ENABLED, SOPORTE_ENABLED, SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";
import { createTicketInputSchema } from "@/lib/validation/soporte";

describe("soporte contracts", () => {
  it("keeps every flag off", () => {
    expect([SOPORTE_ENABLED, MEJORAS_ENABLED, SOPORTE_GITHUB_ENABLED]).toEqual([false, false, false]);
  });

  it("stubs read empty and write NOT_IMPLEMENTED", async () => {
    expect(await listMyTicketsAction({})).toEqual({ rows: [], nextCursor: null });
    const context = { path: "/tareas", estilo: "visual", theme: "azul", viewport: "1280x800", userAgent: "x" };
    expect(await createTicketAction({ kind: "error", title: "Falla", description: "d", context })).toEqual({
      ok: false,
      error: "NOT_IMPLEMENTED",
    });
  });

  it("validates the title length", () => {
    const context = { path: "/", estilo: "", theme: "", viewport: "", userAgent: "" };
    const base = { kind: "mejora", description: "d", context };
    expect(createTicketInputSchema.safeParse({ ...base, title: "abc" }).success).toBe(false);
    expect(createTicketInputSchema.safeParse({ ...base, title: "abcd" }).success).toBe(true);
  });

  it("has no capability for a missing user", () => {
    expect(canManageSupport(null)).toBe(false);
  });
});

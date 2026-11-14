// @vitest-environment node
import { describe, expect, it } from "vitest";

import { canManageSupport } from "@/lib/auth/permissions";
import { MEJORAS_ENABLED, SOPORTE_ENABLED, SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";
import { createTicketInputSchema } from "@/lib/validation/soporte";

describe("soporte contracts", () => {
  it("keeps the GitHub flag off until Phase 3 ships", () => {
    expect([SOPORTE_ENABLED, MEJORAS_ENABLED, SOPORTE_GITHUB_ENABLED]).toEqual([true, true, false]);
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

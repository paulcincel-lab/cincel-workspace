import { describe, expect, it } from "vitest";

import { formatLastLogin, recheckResultMessage, revokedReasonLabel } from "./google-access";

describe("recheckResultMessage", () => {
  it("confirms access", () => {
    expect(recheckResultMessage({ ok: true, allowed: true })).toEqual({ tone: "ok", text: "Acceso confirmado" });
  });

  it("names the reason of a revoke", () => {
    expect(recheckResultMessage({ ok: true, allowed: false, reason: "no_role_group" })).toEqual({
      tone: "revoked",
      text: "Acceso retirado: no pertenece a ningún grupo de rol de Cincel",
    });
  });

  it("asks to retry on a Directory error", () => {
    expect(recheckResultMessage({ ok: false, error: "directory_error" }).text).toBe(
      "No pudimos consultar Google; intenta más tarde",
    );
  });

  it("explains staff not linked to Google and forbidden callers", () => {
    expect(recheckResultMessage({ ok: false, error: "not_google_linked" }).tone).toBe("error");
    expect(recheckResultMessage({ ok: false, error: "forbidden" }).tone).toBe("error");
  });
});

describe("revokedReasonLabel", () => {
  it("falls back for empty and unknown reasons", () => {
    expect(revokedReasonLabel(null)).toBe("sin motivo registrado");
    expect(revokedReasonLabel("something_new")).toBe("something_new");
  });
});

describe("formatLastLogin", () => {
  it("says Nunca without a sign-in", () => {
    expect(formatLastLogin(null)).toBe("Nunca");
    expect(formatLastLogin("2026-11-03T12:00:00.000Z")).not.toBe("Nunca");
  });
});

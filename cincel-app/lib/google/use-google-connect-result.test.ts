// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { googleConnectResultFrom, useGoogleConnectResult } from "./use-google-connect-result";

const result = (query: string) => googleConnectResultFrom(new URLSearchParams(query));

describe("googleConnectResultFrom", () => {
  it("is null without google_connected", () => {
    expect(result("")).toBeNull();
    expect(result("motivo=retry")).toBeNull();
  });

  it("reports success", () => {
    expect(result("google_connected=1")).toEqual({ success: true, message: "Cuenta de Google conectada." });
  });

  it("maps the staff consent motivo values", () => {
    expect(result("google_connected=error&motivo=retry")?.message).toBe(
      "No se pudo completar la conexión con Google. Intenta de nuevo.",
    );
    expect(result("google_connected=error&motivo=scope_missing")?.message).toContain("No diste el permiso");
    expect(result("google_connected=error&motivo=sub_mismatch")).toEqual({
      success: false,
      message: "Esta cuenta de Google no coincide con tu usuario. Contacta al administrador.",
    });
    expect(result("google_connected=error&motivo=revoked")?.message).toBe(
      "Tu acceso a Cincel fue retirado en Google Workspace.",
    );
  });

  it("keeps the old reason param working", () => {
    expect(result("google_connected=error&reason=denied")?.message).toBe("Cancelaste la conexión con Google.");
  });

  it("falls back for an unknown motivo", () => {
    expect(result("google_connected=error&motivo=nope")).toEqual({
      success: false,
      message: "No se pudo conectar la cuenta de Google.",
    });
  });
});

describe("useGoogleConnectResult", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("returns the error and strips the params from the URL", async () => {
    window.history.replaceState({}, "", "/calendario?modo=mes&google_connected=error&motivo=retry");
    const { result: hook } = renderHook(() => useGoogleConnectResult());

    await waitFor(() => expect(hook.current?.success).toBe(false));
    expect(hook.current?.message).toBe("No se pudo completar la conexión con Google. Intenta de nuevo.");
    expect(window.location.pathname).toBe("/calendario");
    expect(window.location.search).toBe("?modo=mes");
  });

  it("returns success after the consent round trip", async () => {
    window.history.replaceState({}, "", "/calendario?google_connected=1");
    const { result: hook } = renderHook(() => useGoogleConnectResult());

    await waitFor(() => expect(hook.current).toEqual({ success: true, message: "Cuenta de Google conectada." }));
    expect(window.location.search).toBe("");
  });
});

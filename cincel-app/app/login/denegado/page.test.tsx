// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const sessionReads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: () => {
    sessionReads.count += 1;
    throw new Error("/login/denegado must not read the staff session");
  },
}));

vi.mock("@/lib/auth/session-context", () => ({
  useSessionAccess: () => {
    sessionReads.count += 1;
    throw new Error("/login/denegado must not read the staff session");
  },
}));

import {
  WORKSPACE_DENIAL_REASONS,
  type WorkspaceDenialReason,
} from "@/lib/types/workspace-access";

import LoginDeniedPage from "./page";

const NO_ROLE_GROUP =
  "Tu cuenta no tiene acceso a Cincel. Pide a tu administrador de Google Workspace que te agregue a un grupo de Cincel.";

const EXPECTED: Record<WorkspaceDenialReason, string> = {
  no_role_group: NO_ROLE_GROUP,
  workspace_suspended: "Tu cuenta de Google Workspace está suspendida.",
  workspace_deleted: "Tu cuenta de Google Workspace está suspendida.",
  domain: "Usa tu cuenta de la empresa (@example.test).",
  inactive: "Tu usuario está desactivado en Cincel.",
  sub_mismatch:
    "Esta cuenta de Google no coincide con tu usuario. Contacta al administrador.",
  needs_link:
    "Tu usuario de Cincel no tiene este correo. Pide a un administrador que registre persona@example.test en tu ficha de Equipo.",
  revoked: "Tu acceso a Cincel fue retirado en Google Workspace.",
};

async function renderPage(
  params: Record<string, string | string[] | undefined>,
) {
  render(await LoginDeniedPage({ searchParams: Promise.resolve(params) }));
}

describe("/login/denegado", () => {
  beforeEach(() => {
    sessionReads.count = 0;
    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "example.test");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("covers every shared motivo", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(
      [...WORKSPACE_DENIAL_REASONS].sort(),
    );
  });

  it.each(WORKSPACE_DENIAL_REASONS)(
    "renders the message for motivo=%s",
    async (motivo) => {
      await renderPage({ motivo, email: "persona@example.test" });

      expect(screen.getByRole("alert").textContent).toBe(EXPECTED[motivo]);
    },
  );

  it.each([
    ["unknown motivo", { motivo: "otra_cosa" }],
    ["missing motivo", {}],
    ["empty motivo", { motivo: "" }],
  ])("falls back to the no_role_group text for %s", async (_label, params) => {
    await renderPage(params);

    expect(screen.getByRole("alert").textContent).toBe(NO_ROLE_GROUP);
  });

  it("uses the first value when motivo is repeated", async () => {
    await renderPage({ motivo: ["revoked", "inactive"] });

    expect(screen.getByRole("alert").textContent).toBe(EXPECTED.revoked);
  });

  it("omits the domain when GOOGLE_WORKSPACE_DOMAIN is not set", async () => {
    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "");
    await renderPage({ motivo: "domain" });

    expect(screen.getByRole("alert").textContent).toBe(
      "Usa tu cuenta de la empresa.",
    );
  });

  it("uses a generic email placeholder for needs_link without an email", async () => {
    await renderPage({ motivo: "needs_link" });

    expect(screen.getByRole("alert").textContent).toBe(
      "Tu usuario de Cincel no tiene este correo. Pide a un administrador que registre tu correo en tu ficha de Equipo.",
    );
  });

  it("renders without a session and links Volver a intentar to /login", async () => {
    await renderPage({ motivo: "revoked" });

    expect(
      screen
        .getByRole("link", { name: "Volver a intentar" })
        .getAttribute("href"),
    ).toBe("/login");
    expect(sessionReads.count).toBe(0);
  });
});

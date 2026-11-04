import { describe, expect, it, vi } from "vitest";

import {
  bootstrapAdminEmail,
  FIRST_LOGIN_WIZARD_ROUTES,
  firstLoginWizardRoute,
  isBootstrapAdminEmail,
  resolveFirstLoginWizard,
  shouldShowGoogleSetupBanner,
  type FirstLoginInput,
} from "./first-login";

const env = { BOOTSTRAP_ADMIN_EMAIL: " Admin@Example.dev " };

const base: FirstLoginInput = {
  email: "admin@example.dev",
  access: "Administrador",
  googleLinked: false,
  onboardingCompletedAt: null,
  hasAppliedImport: false,
};

describe("bootstrap admin email", () => {
  it("trims and lowercases BOOTSTRAP_ADMIN_EMAIL, null when unset", () => {
    expect(bootstrapAdminEmail(env)).toBe("admin@example.dev");
    expect(bootstrapAdminEmail({ BOOTSTRAP_ADMIN_EMAIL: "  " })).toBeNull();
    expect(bootstrapAdminEmail({})).toBeNull();
  });

  it("matches case insensitively and never matches without the variable", () => {
    expect(isBootstrapAdminEmail("ADMIN@example.dev", env)).toBe(true);
    expect(isBootstrapAdminEmail("otra@example.dev", env)).toBe(false);
    expect(isBootstrapAdminEmail(null, env)).toBe(false);
    expect(isBootstrapAdminEmail("admin@example.dev", {})).toBe(false);
  });
});

describe("resolveFirstLoginWizard", () => {
  it("sends the bootstrap admin to the Google groups wizard", async () => {
    expect(await resolveFirstLoginWizard(base, env)).toBe("google_groups");
  });

  it("never gives the bootstrap admin the monday wizard, even signed in with Google", async () => {
    expect(await resolveFirstLoginWizard({ ...base, googleLinked: true }, env)).toBe("google_groups");
  });

  it("shows nothing once completed or skipped", async () => {
    const completed = { ...base, onboardingCompletedAt: new Date("2026-11-04T10:00:00Z") };
    expect(await resolveFirstLoginWizard(completed, env)).toBeNull();
    expect(await resolveFirstLoginWizard({ ...completed, email: "otra@example.dev", googleLinked: true }, env))
      .toBeNull();
  });

  it("shows nothing to non-admins", async () => {
    expect(await resolveFirstLoginWizard({ ...base, access: "Colaborador" }, env)).toBeNull();
    expect(await resolveFirstLoginWizard({ ...base, access: null }, env)).toBeNull();
  });

  it("other admins never get the Google wizard", async () => {
    const other = { ...base, email: "otra@example.dev" };
    expect(await resolveFirstLoginWizard(other, env)).toBeNull();
    expect(await resolveFirstLoginWizard(other, {})).toBeNull();
  });

  it("sends a Google admin to the monday wizard while no import is applied", async () => {
    const google = { ...base, email: "otra@example.dev", googleLinked: true };
    expect(await resolveFirstLoginWizard(google, env)).toBe("monday_import");
    expect(await resolveFirstLoginWizard({ ...google, hasAppliedImport: true }, env)).toBeNull();
  });

  it("only asks for the import state when it matters", async () => {
    const hasAppliedImport = vi.fn(async () => false);
    await resolveFirstLoginWizard({ ...base, hasAppliedImport }, env);
    await resolveFirstLoginWizard({ ...base, email: "otra@example.dev", hasAppliedImport }, env);
    expect(hasAppliedImport).not.toHaveBeenCalled();
    expect(await resolveFirstLoginWizard({ ...base, email: "x@example.dev", googleLinked: true, hasAppliedImport }, env))
      .toBe("monday_import");
    expect(hasAppliedImport).toHaveBeenCalledTimes(1);
  });
});

describe("firstLoginWizardRoute", () => {
  it("maps a wizard to its page and null to null", () => {
    expect(firstLoginWizardRoute("google_groups")).toBe("/configuracion/google/primeros-pasos");
    expect(firstLoginWizardRoute(null)).toBeNull();
    expect(firstLoginWizardRoute("monday_import")).toBe(FIRST_LOGIN_WIZARD_ROUTES.monday_import);
  });
});

describe("shouldShowGoogleSetupBanner", () => {
  const banner = {
    email: "admin@example.dev",
    access: "Administrador",
    onboardingCompletedAt: new Date("2026-11-04T10:00:00Z"),
    groupMappingCount: 0,
  };

  it("shows after the bootstrap admin skipped while no group is mapped", () => {
    expect(shouldShowGoogleSetupBanner(banner, env)).toBe(true);
  });

  it("hides once a group exists, before skipping, and for anyone else", () => {
    expect(shouldShowGoogleSetupBanner({ ...banner, groupMappingCount: 1 }, env)).toBe(false);
    expect(shouldShowGoogleSetupBanner({ ...banner, onboardingCompletedAt: null }, env)).toBe(false);
    expect(shouldShowGoogleSetupBanner({ ...banner, email: "otra@example.dev" }, env)).toBe(false);
    expect(shouldShowGoogleSetupBanner({ ...banner, access: "Dirección" }, env)).toBe(false);
  });
});

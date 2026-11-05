// @vitest-environment node
/**
 * The seed and the e2e login take the admin password from the env only: no default value is baked into the code,
 * the example env, the README or CI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSeedAdminPassword } from "@/scripts/seed-admin-password";
import { e2eAdminPassword } from "@/tests/e2e/helpers/seed-auth";

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("resolveSeedAdminPassword", () => {
  it("uses SEED_ADMIN_PASSWORD when set", () => {
    expect(resolveSeedAdminPassword({ SEED_ADMIN_PASSWORD: " fake-pass-1 " })).toEqual({
      password: "fake-pass-1",
      generated: false,
    });
  });

  it("generates a different random password when unset or blank", () => {
    const a = resolveSeedAdminPassword({});
    const b = resolveSeedAdminPassword({ SEED_ADMIN_PASSWORD: "   " });
    expect(a.generated).toBe(true);
    expect(b.generated).toBe(true);
    expect(a.password.length).toBeGreaterThanOrEqual(20);
    expect(a.password).not.toBe(b.password);
  });
});

describe("e2eAdminPassword", () => {
  it("returns E2E_ADMIN_PASSWORD when set", () => {
    expect(e2eAdminPassword({ E2E_ADMIN_PASSWORD: "fake-pass-2" })).toBe("fake-pass-2");
  });

  it("fails clearly when unset", () => {
    expect(() => e2eAdminPassword({})).toThrow(/E2E_ADMIN_PASSWORD is not set/);
    expect(() => e2eAdminPassword({ E2E_ADMIN_PASSWORD: "" })).toThrow(/E2E_ADMIN_PASSWORD is not set/);
  });
});

describe("no hard-coded admin password", () => {
  it("seed and e2e helper have no string fallback for the password env", () => {
    expect(read("scripts/seed.ts")).not.toMatch(/SEED_ADMIN_PASSWORD\s*\?\?\s*["'`]/);
    expect(read("tests/e2e/helpers/seed-auth.ts")).not.toMatch(/E2E_ADMIN_PASSWORD\s*\?\?\s*["'`]/);
  });

  it(".env.example shows a placeholder", () => {
    expect(read(".env.example")).toMatch(/^SEED_ADMIN_PASSWORD=(<[^>]+>)?$/m);
  });

  it("no file keeps the old initial password", () => {
    // Built from parts so this file does not contain the value either.
    const old = ["Cincel", "Admin", "2026"].join("");
    for (const rel of [
      "scripts/seed.ts",
      "tests/e2e/helpers/seed-auth.ts",
      ".env.example",
      "README.md",
      "docs/deployment.md",
      "../.github/workflows/cincel-app-build.yml",
    ]) {
      expect(read(rel), rel).not.toContain(old);
    }
  });
});

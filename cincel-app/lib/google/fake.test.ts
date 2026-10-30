// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";

import { getDirectory } from "./directory";
import { assertGoogleFakeAllowed, FAKE_ACCESS_TOKEN, GoogleFakeInProductionError, isGoogleFake } from "./fake";
import { setFakeDirectoryState } from "./fake-directory";
import { DIRECTORY_SCOPES, getServiceAccountTokenSource } from "./service-account";

afterEach(() => {
  vi.unstubAllEnvs();
  setFakeDirectoryState(null);
});

describe("GOOGLE_FAKE switch", () => {
  it("is off unless GOOGLE_FAKE=1", () => {
    expect(isGoogleFake({})).toBe(false);
    expect(isGoogleFake({ GOOGLE_FAKE: "0" })).toBe(false);
    expect(isGoogleFake({ GOOGLE_FAKE: "1", NODE_ENV: "test" })).toBe(true);
  });

  it("throws with GOOGLE_FAKE=1 in production", () => {
    const env = { GOOGLE_FAKE: "1", NODE_ENV: "production" };
    expect(() => assertGoogleFakeAllowed(env)).toThrow(GoogleFakeInProductionError);
    expect(() => isGoogleFake(env)).toThrow(GoogleFakeInProductionError);
    expect(() => assertGoogleFakeAllowed({ NODE_ENV: "production" })).not.toThrow();
  });

  it("refuses to start the server with GOOGLE_FAKE=1 in production", () => {
    vi.stubEnv("GOOGLE_FAKE", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => register()).toThrow(GoogleFakeInProductionError);

    vi.stubEnv("NODE_ENV", "test");
    expect(() => register()).not.toThrow();
  });

  it("exits the Node server process with GOOGLE_FAKE=1 in production", () => {
    vi.stubEnv("GOOGLE_FAKE", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => register()).toThrow(GoogleFakeInProductionError);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }
  });

  it("hands out a fake service account token", async () => {
    const source = getServiceAccountTokenSource(DIRECTORY_SCOPES, { GOOGLE_FAKE: "1" });
    await expect(source!()).resolves.toBe(FAKE_ACCESS_TOKEN);
  });
});

describe("fake Directory", () => {
  function fake() {
    vi.stubEnv("GOOGLE_FAKE", "1");
    vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "");
    const directory = getDirectory();
    expect(directory).not.toBeNull();
    return directory!;
  }

  const groups = [
    { id: "g-admin", email: "cincel-administrador@example.test", name: "Administrador", members: ["Ana@example.test"] },
    { id: "g-area", email: "cincel-area-diseno@example.test", members: [] },
  ];

  it("is selected with GOOGLE_FAKE=1 even without a service account", async () => {
    setFakeDirectoryState({ users: [{ id: "sub-ana", primaryEmail: "ana@example.test" }], groups });
    const directory = fake();

    await expect(directory.getUserStatus("sub-ana")).resolves.toEqual({
      status: "active",
      primaryEmail: "ana@example.test",
    });
    await expect(directory.getUserStatus("sub-unknown")).resolves.toEqual({ status: "deleted", primaryEmail: null });
    await expect(directory.hasMember("g-admin", "ana@example.test")).resolves.toBe(true);
    await expect(directory.hasMember("g-area", "ana@example.test")).resolves.toBe(false);
    await expect(directory.hasMember("g-missing", "ana@example.test")).rejects.toMatchObject({ status: 404 });
    await expect(directory.getGroup("CINCEL-ADMINISTRADOR@example.test")).resolves.toEqual({
      id: "g-admin",
      email: "cincel-administrador@example.test",
      name: "Administrador",
    });
    await expect(directory.getGroup("nope@example.test")).resolves.toBeNull();
  });

  it("reports suspended and archived users", async () => {
    setFakeDirectoryState({
      users: [
        { id: "s1", primaryEmail: "s1@example.test", status: "suspended" },
        { id: "s2", primaryEmail: "s2@example.test", status: "archived" },
      ],
    });
    const directory = fake();
    await expect(directory.getUserStatus("s1")).resolves.toMatchObject({ status: "suspended" });
    await expect(directory.getUserStatus("s2")).resolves.toMatchObject({ status: "archived" });
  });

  it("reads its state from GOOGLE_FAKE_DIRECTORY", async () => {
    vi.stubEnv(
      "GOOGLE_FAKE_DIRECTORY",
      JSON.stringify({ users: [{ id: "sub-env", primaryEmail: "env@example.test" }] }),
    );
    const directory = fake();
    await expect(directory.getUserStatus("sub-env")).resolves.toMatchObject({ status: "active" });
  });

  it("simulates an outage", async () => {
    setFakeDirectoryState({ failWith: "timeout" });
    const directory = fake();
    await expect(directory.getUserStatus("x")).rejects.toMatchObject({ name: "DirectoryError", kind: "timeout" });
    await expect(directory.getGroup("x@example.test")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("throws instead of faking in production", () => {
    vi.stubEnv("GOOGLE_FAKE", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getDirectory()).toThrow(GoogleFakeInProductionError);
  });
});

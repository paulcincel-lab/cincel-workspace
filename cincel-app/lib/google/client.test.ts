import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { JWT } from "google-auth-library";

import { getDriveClientFor, getDriveRootFolderId, isDriveConfigured } from "./client";

const ORIGINAL_ENV = { ...process.env };

function setCreds() {
  process.env.GOOGLE_SA_CLIENT_EMAIL = "sa@project.iam.gserviceaccount.com";
  process.env.GOOGLE_SA_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
}

function clearCreds() {
  delete process.env.GOOGLE_SA_CLIENT_EMAIL;
  delete process.env.GOOGLE_SA_PRIVATE_KEY;
}

describe("getDriveClientFor", () => {
  beforeEach(() => {
    clearCreds();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null when the service account isn't configured", () => {
    expect(getDriveClientFor("ana@cincel.mx")).toBeNull();
  });

  it("returns null when userEmail is empty, even with credentials set", () => {
    setCreds();
    expect(getDriveClientFor("")).toBeNull();
    expect(getDriveClientFor("   ")).toBeNull();
  });

  it("returns a JWT impersonating the given user when configured", () => {
    setCreds();
    const client = getDriveClientFor("ana@cincel.mx");
    expect(client).toBeInstanceOf(JWT);
    expect(client?.subject).toBe("ana@cincel.mx");
  });

  it("caches the client per email — same instance on a repeat call", () => {
    setCreds();
    const first = getDriveClientFor("ana@cincel.mx");
    const second = getDriveClientFor("ana@cincel.mx");
    expect(first).toBe(second);
  });

  it("gives different users different (uncached) client instances", () => {
    setCreds();
    const ana = getDriveClientFor("ana@cincel.mx");
    const beto = getDriveClientFor("beto@cincel.mx");
    expect(ana).not.toBe(beto);
    expect(beto?.subject).toBe("beto@cincel.mx");
  });
});

describe("isDriveConfigured", () => {
  beforeEach(() => {
    clearCreds();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is false with no credentials", () => {
    expect(isDriveConfigured()).toBe(false);
  });

  it("is true once both credential env vars are set, independent of any user", () => {
    setCreds();
    expect(isDriveConfigured()).toBe(true);
  });
});

describe("getDriveRootFolderId", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    delete process.env.GOOGLE_SHARED_DRIVE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses GOOGLE_DRIVE_ROOT_FOLDER_ID when set", () => {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = " folder-1 ";
    process.env.GOOGLE_SHARED_DRIVE_ID = "shared-1";
    expect(getDriveRootFolderId()).toBe("folder-1");
  });

  it("defaults to the Shared Drive root when GOOGLE_DRIVE_ROOT_FOLDER_ID is unset or blank", () => {
    process.env.GOOGLE_SHARED_DRIVE_ID = "shared-1";
    expect(getDriveRootFolderId()).toBe("shared-1");
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "  ";
    expect(getDriveRootFolderId()).toBe("shared-1");
  });

  it("is null when neither is set", () => {
    expect(getDriveRootFolderId()).toBeNull();
  });
});

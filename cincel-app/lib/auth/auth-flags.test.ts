import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAuthFlags,
  isGoogleAuthEnabled,
  isPasswordAuthEnabled,
} from "./auth-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth flags", () => {
  it("defaults to Google off and password on when unset", () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", undefined);
    vi.stubEnv("AUTH_PASSWORD_ENABLED", undefined);
    expect(isGoogleAuthEnabled()).toBe(false);
    expect(isPasswordAuthEnabled()).toBe(true);
    expect(getAuthFlags()).toEqual({
      googleEnabled: false,
      passwordEnabled: true,
    });
  });

  it("keeps defaults for empty or unrecognised values", () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "");
    vi.stubEnv("AUTH_PASSWORD_ENABLED", "0");
    expect(isGoogleAuthEnabled()).toBe(false);
    expect(isPasswordAuthEnabled()).toBe(true);

    vi.stubEnv("AUTH_GOOGLE_ENABLED", "yes");
    vi.stubEnv("AUTH_PASSWORD_ENABLED", "off");
    expect(isGoogleAuthEnabled()).toBe(false);
    expect(isPasswordAuthEnabled()).toBe(true);
  });

  it("reads explicit true/false, ignoring case and spaces", () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", " TRUE ");
    vi.stubEnv("AUTH_PASSWORD_ENABLED", "False");
    expect(getAuthFlags()).toEqual({
      googleEnabled: true,
      passwordEnabled: false,
    });
  });

  it("reads the environment on every call", () => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    expect(isGoogleAuthEnabled()).toBe(true);
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "false");
    expect(isGoogleAuthEnabled()).toBe(false);
  });
});

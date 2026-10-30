import { describe, expect, it } from "vitest";

import { DEFAULT_RETURN_TO, getAppOrigin, safeReturnTo } from "./safe-return-to";

const env = { APP_ORIGIN: "https://app.example.test" };

describe("getAppOrigin", () => {
  it("normalises APP_ORIGIN to its origin", () => {
    expect(getAppOrigin({ APP_ORIGIN: " https://app.example.test/ " })).toBe("https://app.example.test");
    expect(getAppOrigin({ APP_ORIGIN: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("null when unset, empty, malformed or not http(s)", () => {
    expect(getAppOrigin({})).toBeNull();
    expect(getAppOrigin({ APP_ORIGIN: "  " })).toBeNull();
    expect(getAppOrigin({ APP_ORIGIN: "not a url" })).toBeNull();
    expect(getAppOrigin({ APP_ORIGIN: "javascript:alert(1)" })).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeReturnTo("/proyectos/123", "/dashboard", env)).toBe("/proyectos/123");
    expect(safeReturnTo("/recursos?tab=drive#top", "/dashboard", env)).toBe("/recursos?tab=drive#top");
    expect(safeReturnTo("/", "/dashboard", env)).toBe("/");
    expect(safeReturnTo("/login/denegado?motivo=revoked", "/login", env)).toBe("/login/denegado?motivo=revoked");
  });

  it("rejects protocol-relative //x", () => {
    expect(safeReturnTo("//evil.example", "/dashboard", env)).toBe("/dashboard");
  });

  it("rejects /\\x", () => {
    expect(safeReturnTo("/\\evil.example", "/dashboard", env)).toBe("/dashboard");
  });

  it("rejects absolute URLs, same origin included", () => {
    expect(safeReturnTo("https://evil.example/", "/dashboard", env)).toBe("/dashboard");
    expect(safeReturnTo("https://app.example.test/proyectos", "/dashboard", env)).toBe("/dashboard");
    expect(safeReturnTo("javascript:alert(1)", "/dashboard", env)).toBe("/dashboard");
  });

  it("rejects relative paths without a leading slash", () => {
    expect(safeReturnTo("dashboard", "/login", env)).toBe("/login");
    expect(safeReturnTo("evil.example/x", "/login", env)).toBe("/login");
  });

  it("rejects control characters", () => {
    expect(safeReturnTo("/\t/evil.example", "/dashboard", env)).toBe("/dashboard");
    expect(safeReturnTo("/a\nb", "/dashboard", env)).toBe("/dashboard");
    expect(safeReturnTo("/a\u0000b", "/dashboard", env)).toBe("/dashboard");
    expect(safeReturnTo("/a\u007fb", "/dashboard", env)).toBe("/dashboard");
  });

  it("normalises a later backslash that stays on the same origin", () => {
    // `/a\b` resolves to `/a/b` on the same origin: allowed and normalised.
    expect(safeReturnTo("/a\\b", "/dashboard", env)).toBe("/a/b");
  });

  it("falls back on empty and non-string values", () => {
    expect(safeReturnTo("", "/portal", env)).toBe("/portal");
    expect(safeReturnTo(null, "/portal", env)).toBe("/portal");
    expect(safeReturnTo(undefined, "/portal", env)).toBe("/portal");
    expect(safeReturnTo(42, "/portal", env)).toBe("/portal");
  });

  it("defaults the fallback to /dashboard", () => {
    expect(DEFAULT_RETURN_TO).toBe("/dashboard");
    expect(safeReturnTo("//evil.example", undefined, env)).toBe("/dashboard");
  });

  it("applies the same rules when APP_ORIGIN isn't configured", () => {
    expect(safeReturnTo("/proyectos", "/dashboard", {})).toBe("/proyectos");
    expect(safeReturnTo("//evil.example", "/dashboard", {})).toBe("/dashboard");
    expect(safeReturnTo("/\\evil.example", "/dashboard", {})).toBe("/dashboard");
    expect(safeReturnTo("https://evil.example", "/dashboard", {})).toBe("/dashboard");
  });
});

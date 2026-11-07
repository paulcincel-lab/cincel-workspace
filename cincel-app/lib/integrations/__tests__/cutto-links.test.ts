import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUTTO_LINK_LABELS,
  CUTTO_LINK_TARGET,
  DEFAULT_CUTTO_BASE_URL,
  channelUrl,
  cuttoBaseUrl,
  cuttoLinks,
  meetingUrl,
  personChatUrl,
} from "@/lib/integrations/cutto-links";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cuttoBaseUrl", () => {
  it("falls back to the documented default when the variable is unset or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", undefined);
    expect(cuttoBaseUrl()).toBe(DEFAULT_CUTTO_BASE_URL);
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "   ");
    expect(cuttoBaseUrl()).toBe(DEFAULT_CUTTO_BASE_URL);
    expect(DEFAULT_CUTTO_BASE_URL).toBe("https://cutto.cloudketer.dev");
  });

  it("uses the configured base URL without trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "https://cutto.example.test/app//");
    expect(cuttoBaseUrl()).toBe("https://cutto.example.test/app");
  });

  it("is null for a value that is not an absolute http(s) URL", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "not a url");
    expect(cuttoBaseUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "javascript:alert(1)");
    expect(cuttoBaseUrl()).toBeNull();
  });
});

describe("Cutto deep links", () => {
  it("builds the BE §11.2 URL scheme from the default base", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "");
    expect(channelUrl("p-1")).toBe("https://cutto.cloudketer.dev/c/project-p-1");
    expect(meetingUrl("m-9")).toBe("https://cutto.cloudketer.dev/m/m-9");
    expect(personChatUrl("ana@cincel.mx")).toBe("https://cutto.cloudketer.dev/dm/ana%40cincel.mx");
  });

  it("uses the configured base", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "https://cutto.example.test/");
    expect(channelUrl("abc")).toBe("https://cutto.example.test/c/project-abc");
  });

  it("encodes the path segment and normalizes the email", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "");
    expect(meetingUrl("a/b?c")).toBe("https://cutto.cloudketer.dev/m/a%2Fb%3Fc");
    expect(personChatUrl("  Ana.Pérez@Cincel.MX ")).toBe(
      "https://cutto.cloudketer.dev/dm/ana.p%C3%A9rez%40cincel.mx",
    );
  });

  it("returns null for blank or missing ids so callers hide the link", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "");
    for (const value of ["", "   ", null, undefined]) {
      expect(channelUrl(value)).toBeNull();
      expect(meetingUrl(value)).toBeNull();
      expect(personChatUrl(value)).toBeNull();
    }
  });

  it("returns null when the base URL is unusable", () => {
    vi.stubEnv("NEXT_PUBLIC_CUTTO_BASE_URL", "ftp://cutto.example.test");
    expect(channelUrl("p-1")).toBeNull();
    expect(meetingUrl("m-1")).toBeNull();
    expect(personChatUrl("ana@cincel.mx")).toBeNull();
  });

  it("exposes the same helpers on cuttoLinks", () => {
    expect(cuttoLinks).toEqual({ channelUrl, meetingUrl, personChatUrl });
  });

  it("carries the Spanish labels and new-tab attributes of FE §4.9", () => {
    expect(CUTTO_LINK_LABELS).toEqual({ open: "Abrir en Cutto", chat: "Abrir chat en Cutto" });
    expect(CUTTO_LINK_TARGET).toEqual({ target: "_blank", rel: "noopener" });
  });
});

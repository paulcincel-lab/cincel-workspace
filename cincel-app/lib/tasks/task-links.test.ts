import { describe, expect, it } from "vitest";

import { normalizeTaskLinkUrl } from "./task-links";

describe("normalizeTaskLinkUrl", () => {
  it("accepts http and https links, trimming whitespace", () => {
    expect(normalizeTaskLinkUrl("  https://drive.google.com/file/d/abc/view  ")).toBe(
      "https://drive.google.com/file/d/abc/view"
    );
    expect(normalizeTaskLinkUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects script and data URLs that would run from an href", () => {
    expect(normalizeTaskLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeTaskLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeTaskLinkUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("rejects things that aren't URLs at all", () => {
    expect(normalizeTaskLinkUrl("")).toBeNull();
    expect(normalizeTaskLinkUrl("drive.google.com/file")).toBeNull();
    expect(normalizeTaskLinkUrl("ftp://example.com/x")).toBeNull();
  });
});

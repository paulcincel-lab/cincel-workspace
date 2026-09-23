import { describe, expect, it } from "vitest";

import { canPreviewInline, driveContentUrl } from "./drive-url";

describe("canPreviewInline", () => {
  it("previews PDFs, raster images, plain text and Google-native docs", () => {
    for (const mime of [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
    ]) {
      expect(canPreviewInline(mime)).toBe(true);
    }
  });

  it("tries an unknown type optimistically", () => {
    expect(canPreviewInline(null)).toBe(true);
    expect(canPreviewInline(undefined)).toBe(true);
  });

  it("refuses folders, SVG (can carry script), HTML and Office files", () => {
    for (const mime of [
      "application/vnd.google-apps.folder",
      "image/svg+xml",
      "text/html",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(canPreviewInline(mime)).toBe(false);
    }
  });
});

describe("driveContentUrl", () => {
  it("builds the proxied content path and encodes the id", () => {
    expect(driveContentUrl("abc123")).toBe("/api/google/drive/file/abc123/content");
    expect(driveContentUrl("a/b")).toBe("/api/google/drive/file/a%2Fb/content");
  });
});

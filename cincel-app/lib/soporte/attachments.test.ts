// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addAttachmentFiles,
  ATTACHMENT_ERRORS,
  ATTACHMENT_MAX_BYTES,
  attachmentFileError,
  attachmentUrl,
} from "@/lib/soporte/attachments-rules";

const png = (name: string, size = 1000) => ({ name, size, type: "image/png" });

describe("attachment rules", () => {
  it("accepts png, jpeg and webp up to 5 MB", () => {
    expect(attachmentFileError(png("a.png", ATTACHMENT_MAX_BYTES))).toBeNull();
    expect(attachmentFileError({ size: 10, type: "image/jpeg" })).toBeNull();
    expect(attachmentFileError({ size: 10, type: "image/webp" })).toBeNull();
  });

  it("rejects over-limit, wrong type and empty files with Spanish copy", () => {
    expect(attachmentFileError(png("a.png", ATTACHMENT_MAX_BYTES + 1))).toBe(ATTACHMENT_ERRORS.tooLarge);
    expect(attachmentFileError({ size: 10, type: "image/gif" })).toBe(ATTACHMENT_ERRORS.invalidType);
    expect(attachmentFileError({ size: 0, type: "image/png" })).toBe(ATTACHMENT_ERRORS.empty);
  });

  it("keeps at most 3 files and reports the extra and the invalid ones", () => {
    const current = [png("1.png"), png("2.png")];
    const { files, errors } = addAttachmentFiles(current, [
      png("3.png"),
      png("4.png"),
      png("big.png", ATTACHMENT_MAX_BYTES + 1),
    ]);
    expect(files.map((f) => f.name)).toEqual(["1.png", "2.png", "3.png"]);
    expect(errors).toContain(ATTACHMENT_ERRORS.tooMany);
    expect(errors).toContain(`big.png: ${ATTACHMENT_ERRORS.tooLarge}`);
  });

  it("serves attachments through the authenticated route", () => {
    expect(attachmentUrl("abc")).toBe("/api/soporte/adjuntos/abc");
  });
});

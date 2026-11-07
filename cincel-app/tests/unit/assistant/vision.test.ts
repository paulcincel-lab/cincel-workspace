// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  isPickerDriveConfigured: vi.fn(() => true),
  getStaffAccessToken: vi.fn(),
  getFileContent: vi.fn(),
  getFileMeta: vi.fn(),
}));

vi.mock("@/lib/google/picker-drive", () => ({ isPickerDriveConfigured: h.isPickerDriveConfigured }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: h.getStaffAccessToken }));
vi.mock("@/lib/google/drive-repository", () => ({ getFileContent: h.getFileContent, getFileMeta: h.getFileMeta }));

import {
  driveCallerFor,
  driveFileIdOf,
  driveFileRef,
  extractJsonObject,
  isVisionAvailable,
  loadVisionFiles,
  MAX_VISION_BYTES,
} from "@/lib/assistant/vision";

const ENV_KEYS = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_VISION"] as const;
const saved: Record<string, string | undefined> = {};

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const caller = { staffId: "s1", email: "a@cincel.mx", accessToken: "tok" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.LLM_BASE_URL = "https://llm.example/v1";
  process.env.LLM_API_KEY = "key";
  delete process.env.LLM_VISION;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isVisionAvailable", () => {
  it("is off unless LLM_VISION declares image input", () => {
    expect(isVisionAvailable()).toBe(false);
    process.env.LLM_VISION = "false";
    expect(isVisionAvailable()).toBe(false);
    process.env.LLM_VISION = "true";
    expect(isVisionAvailable()).toBe(true);
  });

  it("is off when the assistant itself is not configured", () => {
    process.env.LLM_VISION = "true";
    delete process.env.LLM_BASE_URL;
    expect(isVisionAvailable()).toBe(false);
  });
});

describe("Drive access", () => {
  it("explains a missing Drive grant", async () => {
    h.getStaffAccessToken.mockResolvedValue({ status: "needs_consent" });
    expect(await driveCallerFor({ staffId: "s1", email: "a@cincel.mx" })).toMatchObject({ ok: false, error: "NEEDS_CONSENT" });
    h.isPickerDriveConfigured.mockReturnValueOnce(false);
    expect(await driveCallerFor({ staffId: "s1", email: "a@cincel.mx" })).toMatchObject({ ok: false, error: "DRIVE_NOT_CONFIGURED" });
  });

  it("accepts a Drive URL or a bare id", () => {
    expect(driveFileIdOf("https://drive.google.com/file/d/abc123/view")).toBe("abc123");
    expect(driveFileIdOf(" abc123 ")).toBe("abc123");
  });

  it("loads images and refuses other types", async () => {
    h.getFileContent.mockResolvedValueOnce({ name: "plano.png", mimeType: "image/png", body: streamOf(new Uint8Array([1, 2, 3])) });
    const ok = await loadVisionFiles(caller, ["a"], { allowPdf: false });
    expect(ok).toMatchObject({ ok: true, files: [{ id: "a", name: "plano.png", mimeType: "image/png" }] });

    h.getFileContent.mockResolvedValueOnce({ name: "plano.pdf", mimeType: "application/pdf", body: streamOf(new Uint8Array([1])) });
    expect(await loadVisionFiles(caller, ["b"], { allowPdf: false })).toMatchObject({ ok: false, error: "INVALID_TYPE" });

    h.getFileContent.mockResolvedValueOnce({ name: "plano.pdf", mimeType: "application/pdf", body: streamOf(new Uint8Array([1])) });
    expect(await loadVisionFiles(caller, ["b"], { allowPdf: true })).toMatchObject({ ok: true });
  });

  it("refuses files over the size limit and maps Drive errors", async () => {
    h.getFileContent.mockResolvedValueOnce({ name: "big.jpg", mimeType: "image/jpeg", body: streamOf(new Uint8Array(MAX_VISION_BYTES + 1)) });
    expect(await loadVisionFiles(caller, ["a"], { allowPdf: false })).toMatchObject({ ok: false, error: "TOO_LARGE" });
    h.getFileContent.mockRejectedValueOnce(new Error("DRIVE_API_404: not found"));
    expect(await loadVisionFiles(caller, ["a"], { allowPdf: false })).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("falls back to the bare Drive link when metadata can't be read", async () => {
    h.getFileMeta.mockRejectedValueOnce(new Error("DRIVE_API_403"));
    expect(await driveFileRef(caller, "f1")).toEqual({ id: "f1", name: "f1", url: "https://drive.google.com/file/d/f1/view" });
    expect(await driveFileRef(null, "f2")).toEqual({ id: "f2", name: "f2", url: "https://drive.google.com/file/d/f2/view" });
  });
});

describe("extractJsonObject", () => {
  it("reads the JSON object of a model answer", () => {
    expect(extractJsonObject('{"spaces":[]}')).toEqual({ spaces: [] });
    expect(extractJsonObject('Aquí está:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject("sin json")).toBeNull();
    expect(extractJsonObject("{roto")).toBeNull();
  });
});

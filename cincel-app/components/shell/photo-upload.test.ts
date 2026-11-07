// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { fitWithin, reencodePhoto, uploadMyPhoto } from "./photo-upload";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fitWithin", () => {
  it("scales the longest side down to 1024 px and keeps the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(1500, 3000)).toEqual({ width: 512, height: 1024 });
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("returns zero for an empty image", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("reencodePhoto", () => {
  it("rejects files that are not JPG, PNG or WebP before decoding", async () => {
    await expect(reencodePhoto(new File(["x"], "doc.pdf", { type: "application/pdf" }))).rejects.toThrow("INVALID_TYPE");
    await expect(reencodePhoto(new File(["x"], "anim.gif", { type: "image/gif" }))).rejects.toThrow("INVALID_TYPE");
  });
});

describe("uploadMyPhoto", () => {
  it("posts the file field and resolves with the url", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "/api/staff/s1/photo?v=3" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadMyPhoto(new Blob(["x"], { type: "image/jpeg" }))).resolves.toBe("/api/staff/s1/photo?v=3");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/staff/me/photo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeTruthy();
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [413, "TOO_LARGE"],
    [415, "INVALID_TYPE"],
    [429, "RATE_LIMITED"],
  ])("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
    await expect(uploadMyPhoto(new Blob(["x"]))).rejects.toThrow(code);
  });

  it("prefers the error code from the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "TOO_LARGE" }, { status: 400 })));
    await expect(uploadMyPhoto(new Blob(["x"]))).rejects.toThrow("TOO_LARGE");
  });
});

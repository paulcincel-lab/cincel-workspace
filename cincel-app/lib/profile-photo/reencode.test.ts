// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { actionErrorText } from "@/lib/errors";

import { PHOTO_UPLOAD_URL, fitWithin, reencodePhoto, uploadMyPhoto } from "./reencode";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fitWithin", () => {
  it("scales the longest side down to 1024 px and keeps the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(1500, 3000)).toEqual({ width: 512, height: 1024 });
  });

  it("never upscales", () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
  });
});

describe("reencodePhoto", () => {
  it("refuses a file that is not an image before decoding it", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(reencodePhoto(new File(["%PDF"], "doc.pdf", { type: "application/pdf" }))).rejects.toThrow("INVALID_TYPE");
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports INVALID_TYPE when the browser can't decode the image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("decode");
    }));
    await expect(reencodePhoto(new File(["no"], "x.png", { type: "image/png" }))).rejects.toThrow("INVALID_TYPE");
  });
});

describe("uploadMyPhoto", () => {
  it("posts the photo as the multipart field `file` and returns the new URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { url: "/api/staff/a/photo?v=12345678" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadMyPhoto(new Blob(["jpeg"], { type: "image/jpeg" }))).resolves.toBe("/api/staff/a/photo?v=12345678");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PHOTO_UPLOAD_URL);
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeTruthy();
  });

  it.each([
    [413, { error: "TOO_LARGE" }, "TOO_LARGE"],
    [415, { error: "INVALID_TYPE" }, "INVALID_TYPE"],
    [429, { error: "RATE_LIMITED" }, "RATE_LIMITED"],
    [413, undefined, "TOO_LARGE"],
    [415, undefined, "INVALID_TYPE"],
    [429, undefined, "RATE_LIMITED"],
  ])("maps a %s response to %s", async (status, body, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(status, body)));
    await expect(uploadMyPhoto(new Blob(["x"]))).rejects.toThrow(code);
  });

  it("falls back to the generic copy for other failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(500, undefined)));
    const err = await uploadMyPhoto(new Blob(["x"])).catch((e: unknown) => e);
    expect(actionErrorText(err, "photo")).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
});

describe("actionErrorText for the photo route", () => {
  it("gives the FE §9 copy for each code and HTTP status", () => {
    expect(actionErrorText("TOO_LARGE", "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
    expect(actionErrorText(413, "photo")).toBe("La imagen pesa más de 2 MB. Elige una más ligera.");
    expect(actionErrorText("INVALID_TYPE", "photo")).toBe("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
    expect(actionErrorText(415, "photo")).toBe("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
    expect(actionErrorText(429, "photo")).toBe("Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.");
  });
});

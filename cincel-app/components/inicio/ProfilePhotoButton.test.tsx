// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const reencodeToJpeg = vi.fn<(file: Blob, maxSide?: number) => Promise<Blob>>();

vi.mock("./reencode-photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reencode-photo")>();
  return { ...actual, reencodeToJpeg: (file: Blob, maxSide?: number) => reencodeToJpeg(file, maxSide) };
});

import { actionErrorText } from "@/lib/errors";

import { ProfilePhotoButton } from "./ProfilePhotoButton";
import { PHOTO_ACCEPT, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, scaledSize } from "./reencode-photo";

const TOO_LARGE = "La imagen pesa más de 2 MB. Elige una más ligera.";
const INVALID_TYPE = "Ese archivo no es una imagen. Usa JPG, PNG o WebP.";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(photoUrl: string | null = null) {
  const onChange = vi.fn();
  render(<ProfilePhotoButton photoUrl={photoUrl} initials="AL" onChange={onChange} />);
  const input = screen.getByTestId("profile-photo-input") as HTMLInputElement;
  return { onChange, input };
}

function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  fireEvent.change(input);
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", { type: "image/png" });

beforeEach(() => {
  reencodeToJpeg.mockReset();
  reencodeToJpeg.mockResolvedValue(new Blob([new Uint8Array(1200)], { type: "image/jpeg" }));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProfilePhotoButton", () => {
  it("offers a jpeg / png / webp file picker behind the camera button", () => {
    const { input } = setup();
    expect(input.getAttribute("accept")).toBe(PHOTO_ACCEPT);
    expect(PHOTO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(screen.getByRole("button", { name: "Subir foto de perfil" })).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("re-encodes to JPEG before uploading and reports the new URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "/api/staff/s-1/photo?v=abcd1234" }));
    const { input, onChange } = setup();
    const file = png();
    pick(input, file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/api/staff/s-1/photo?v=abcd1234"));
    expect(reencodeToJpeg).toHaveBeenCalledTimes(1);
    expect(reencodeToJpeg.mock.calls[0][0]).toBe(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/staff/me/photo");
    expect(init?.method).toBe("POST");
    const sent = (init?.body as FormData).get("file");
    expect(sent).toBeInstanceOf(Blob);
    expect((sent as Blob).type).toBe("image/jpeg");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the TOO_LARGE copy on 413", async () => {
    fetchMock.mockResolvedValue(jsonResponse(413, { error: "TOO_LARGE" }));
    const { input, onChange } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(TOO_LARGE);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("maps a bare 413 status to TOO_LARGE", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 413 }));
    const { input } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(TOO_LARGE);
  });

  it("does not upload a re-encode above 2 MB", async () => {
    reencodeToJpeg.mockResolvedValue(new Blob([new Uint8Array(PHOTO_MAX_BYTES + 1)], { type: "image/jpeg" }));
    const { input } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(TOO_LARGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the INVALID_TYPE copy on 415", async () => {
    fetchMock.mockResolvedValue(jsonResponse(415, { error: "INVALID_TYPE" }));
    const { input } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_TYPE);
  });

  it("rejects a non-image file without re-encoding or uploading", async () => {
    const { input } = setup();
    pick(input, new File(["hola"], "notas.txt", { type: "text/plain" }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_TYPE);
    expect(reencodeToJpeg).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows INVALID_TYPE when the browser cannot decode the image", async () => {
    reencodeToJpeg.mockRejectedValue(new Error("INVALID_TYPE"));
    const { input } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_TYPE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows RATE_LIMITED through actionErrorText on 429", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: "RATE_LIMITED" }));
    const { input } = setup();
    pick(input, png());
    expect((await screen.findByRole("alert")).textContent).toBe(actionErrorText("RATE_LIMITED"));
  });

  it("labels the button as a change when a photo exists", () => {
    setup("/api/staff/s-1/photo?v=abcd1234");
    expect(screen.getByRole("button", { name: "Cambiar foto de perfil" })).toBeTruthy();
  });
});

describe("scaledSize", () => {
  it("fits the longest side in 1024 px", () => {
    expect(PHOTO_MAX_SIDE).toBe(1024);
    expect(scaledSize(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(scaledSize(3000, 6000)).toEqual({ width: 512, height: 1024 });
  });

  it("never upscales", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

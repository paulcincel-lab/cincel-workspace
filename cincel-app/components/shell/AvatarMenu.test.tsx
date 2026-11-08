// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  photoImplemented: true,
  company: {
    instagramUrl: "https://instagram.com/cincel",
    website: "https://cincel.mx",
    contactEmail: "hola@cincel.mx",
  } as { instagramUrl?: string; website: string; contactEmail?: string },
  refresh: vi.fn(),
  push: vi.fn(),
  removePhoto: vi.fn(),
  logout: vi.fn(),
  setAccess: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: state.refresh, push: state.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
}));

vi.mock("sonner", () => ({ toast: { error: state.toastError, success: state.toastSuccess } }));

vi.mock("@/lib/actions/profile-photo-actions", () => ({
  removeMyPhotoAction: () => state.removePhoto(),
}));
vi.mock("@/lib/actions/profile-photo-actions.flags", () => ({
  get IMPLEMENTED() {
    return { removeMyPhotoAction: state.photoImplemented };
  },
}));
vi.mock("@/lib/auth/auth-actions", () => ({ logoutAction: () => state.logout() }));
vi.mock("@/lib/stores/session-store", () => ({
  useSessionStore: { getState: () => ({ setAccess: state.setAccess }) },
}));
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return {
    useGeneralSettings: () => {
      const base = buildDefaultGeneralSettings();
      return { ...base, company: { ...base.company, ...state.company } };
    },
  };
});
// Canvas does not decode images in happy-dom: skip the re-encode, keep the real upload.
vi.mock("./photo-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./photo-upload")>();
  const upload = (file: File) => actual.uploadMyPhoto(file);
  return { ...actual, changeMyPhoto: upload, usePhotoUploadMutation: () => actual.usePhotoUploadMutation(upload) };
});

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { MyProfile } from "@/lib/types/shell";

import { AvatarMenu, avatarMenuLinks, nameInitials } from "./AvatarMenu";

const session = { staffId: "s1", name: "Ana López", role: "Administrador", isAdmin: true, photoUrl: null as string | null };

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Menú de la cuenta de Ana López/ }));
  return screen.findByRole("menu");
}

function itemLabels(): string[] {
  return screen.getAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
}

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  state.photoImplemented = true;
  state.company = { instagramUrl: "https://instagram.com/cincel", website: "https://cincel.mx", contactEmail: "hola@cincel.mx" };
  state.removePhoto.mockResolvedValue(undefined);
  state.logout.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("avatarMenuLinks", () => {
  it("skips empty fields and builds a mailto link", () => {
    expect(avatarMenuLinks({ website: " ", instagramUrl: "", contactEmail: "a@b.mx" })).toEqual([
      { key: "email", label: "Correo", href: "mailto:a@b.mx" },
    ]);
    expect(avatarMenuLinks({ website: "https://x.mx" }).map((l) => l.label)).toEqual(["Sitio web"]);
  });

  it("builds initials from the first and last word", () => {
    expect(nameInitials("Ana María López")).toBe("AL");
    expect(nameInitials("Ana")).toBe("AN");
    expect(nameInitials("  ")).toBe("?");
  });
});

describe("AvatarMenu", () => {
  it("lists the items in the spec order", async () => {
    renderWithQueryClient(<AvatarMenu session={{ ...session, photoUrl: "/api/staff/s1/photo?v=1" }} />);
    await openMenu();
    expect(itemLabels()).toEqual([
      "Perfil",
      "Apariencia",
      "Instagram",
      "Sitio web",
      "Correo",
      "Cambiar foto",
      "Quitar foto",
      "Cerrar sesión",
    ]);
    expect(screen.getByRole("menuitem", { name: "Perfil" }).getAttribute("href")).toBe("/ajustes/perfil");
    expect(screen.getByRole("menuitem", { name: "Apariencia" }).getAttribute("href")).toBe("/ajustes/apariencia");
  });

  it("takes the contact links from General settings and hides the empty ones", async () => {
    state.company = { website: "", instagramUrl: "https://instagram.com/cincel", contactEmail: "" };
    renderWithQueryClient(<AvatarMenu session={session} />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Instagram" }).getAttribute("href")).toBe("https://instagram.com/cincel");
    expect(screen.queryByRole("menuitem", { name: "Sitio web" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Correo" })).toBeNull();
  });

  it("points Correo at a mailto link", async () => {
    renderWithQueryClient(<AvatarMenu session={session} />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Correo" }).getAttribute("href")).toBe("mailto:hola@cincel.mx");
  });

  it("hides the photo entries while their actions are not implemented", async () => {
    state.photoImplemented = false;
    renderWithQueryClient(<AvatarMenu session={{ ...session, photoUrl: "/x" }} />);
    await openMenu();
    const labels = itemLabels();
    expect(labels).not.toContain("Cambiar foto");
    expect(labels).not.toContain("Quitar foto");
    expect(labels).toContain("Cerrar sesión");
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("has no entry back to the old design", async () => {
    renderWithQueryClient(<AvatarMenu session={session} />);
    await openMenu();
    expect(itemLabels().some((label) => /diseño/i.test(label))).toBe(false);
  });

  it("signs the user out", async () => {
    renderWithQueryClient(<AvatarMenu session={session} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(state.logout).toHaveBeenCalled());
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
    expect(state.setAccess).toHaveBeenCalledWith({ status: "guest", user: null });
    // Logout is the one auth refresh the menu keeps.
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the photo after a successful upload", async () => {
    const fetchMock = mockFetch(200, { url: "/api/staff/s1/photo?v=2" });
    const onPhotoChange = vi.fn();
    const { container } = renderWithQueryClient(<AvatarMenu session={session} onPhotoChange={onPhotoChange} />);
    expect(container.querySelector('[data-photo="initials"]')).not.toBeNull();
    pickFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(onPhotoChange).toHaveBeenCalledWith("/api/staff/s1/photo?v=2"));
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/me/photo", expect.objectContaining({ method: "POST" }));
    expect(container.querySelector('[data-photo="photo"]')).not.toBeNull();
    // `me.profile` carries the new photo: no server render.
    expect(state.refresh).not.toHaveBeenCalled();
    await openMenu();
    expect(itemLabels()).toContain("Quitar foto");
  });

  it.each([
    [413, "TOO_LARGE", "La imagen pesa más de 2 MB. Elige una más ligera."],
    [415, "INVALID_TYPE", "Ese archivo no es una imagen. Usa JPG, PNG o WebP."],
    [429, "RATE_LIMITED", "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
  ])("shows the copy for a %i upload error", async (status, code, copy) => {
    mockFetch(status, { error: code });
    const onPhotoChange = vi.fn();
    renderWithQueryClient(<AvatarMenu session={session} onPhotoChange={onPhotoChange} />);
    pickFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith(copy));
    expect(onPhotoChange).not.toHaveBeenCalled();
  });

  it("maps a bare status without a body to the same copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 413 })));
    renderWithQueryClient(<AvatarMenu session={session} />);
    pickFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("La imagen pesa más de 2 MB. Elige una más ligera."));
  });

  it("falls back to initials after removing the photo", async () => {
    const onPhotoChange = vi.fn();
    const { container } = renderWithQueryClient(<AvatarMenu session={{ ...session, photoUrl: "/api/staff/s1/photo?v=1" }} onPhotoChange={onPhotoChange} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Quitar foto" }));
    await waitFor(() => expect(state.removePhoto).toHaveBeenCalled());
    await waitFor(() => expect(onPhotoChange).toHaveBeenCalledWith(null));
    expect(container.querySelector('[data-photo="initials"]')).not.toBeNull();
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("writes the uploaded photo into me.profile", async () => {
    mockFetch(200, { url: "/api/staff/s1/photo?v=3" });
    const onPhotoChange = vi.fn();
    const { client } = renderWithQueryClient(<AvatarMenu session={session} onPhotoChange={onPhotoChange} />);
    expect(client.getQueryData<MyProfile>(qk.me.profile())).toEqual({ id: "s1", name: "Ana López", photoUrl: null });
    pickFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(onPhotoChange).toHaveBeenCalled());
    expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBe("/api/staff/s1/photo?v=3");
  });

  it("sets me.profile.photoUrl to null after removing the photo", async () => {
    const { client } = renderWithQueryClient(<AvatarMenu session={{ ...session, photoUrl: "/api/staff/s1/photo?v=1" }} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Quitar foto" }));
    await waitFor(() => expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBeNull());
  });

  it("shows a photo another screen wrote into me.profile", async () => {
    const client = createTestQueryClient();
    client.setQueryData<MyProfile>(qk.me.profile(), { id: "s1", name: "Ana López", photoUrl: "/api/staff/s1/photo?v=9" });
    const { container } = renderWithQueryClient(<AvatarMenu session={session} />, { client });
    expect(container.querySelector('[data-photo="photo"]')).not.toBeNull();
  });

  it("shows the photo copy when the removal fails", async () => {
    state.removePhoto.mockRejectedValue(new Error("RATE_LIMITED"));
    renderWithQueryClient(<AvatarMenu session={{ ...session, photoUrl: "/x" }} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Quitar foto" }));
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith("Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."),
    );
  });
});

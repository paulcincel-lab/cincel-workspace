// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  photoFlags: { removeMyPhotoAction: true } as Record<string, boolean>,
  removeMyPhotoAction: vi.fn(),
  updateStaffAction: vi.fn(),
  upsertStaffProfileAction: vi.fn(),
  changePasswordAction: vi.fn(),
  reencodePhoto: vi.fn(),
  uploadMyPhoto: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }));
vi.mock("@/lib/actions/profile-photo-actions.flags", () => ({ IMPLEMENTED: mocks.photoFlags }));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: mocks.removeMyPhotoAction }));
vi.mock("@/lib/actions/staff-actions", () => ({
  updateStaffAction: mocks.updateStaffAction,
  upsertStaffProfileAction: mocks.upsertStaffProfileAction,
}));
vi.mock("@/lib/auth/auth-actions", () => ({ changePasswordAction: mocks.changePasswordAction }));
vi.mock("@/lib/profile-photo/reencode", () => ({ reencodePhoto: mocks.reencodePhoto, uploadMyPhoto: mocks.uploadMyPhoto }));

// Contract-shaped stand-ins for the shared patterns (FE §4.11), so this test covers the page content on its own.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
    </section>
  ),
}));
vi.mock("@/components/patterns/SettingsRow", () => ({
  SettingsRow: ({ label, description, control, htmlFor }: { label: string; description?: string; control: ReactNode; htmlFor?: string }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {description ? <p>{description}</p> : null}
      {control}
    </div>
  ),
}));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { MyProfile } from "@/lib/types/shell";

import {
  PerfilClient,
  PerfilContrasena,
  PerfilDatos,
  PerfilFoto,
  PerfilHorasSemana,
  formatWeekHoursLine,
  initialsOf,
  passwordChangeErrorText,
  type PerfilData,
} from "./PerfilClient";

const BASE: PerfilData = {
  staffId: "00000000-0000-0000-0000-0000000000aa",
  name: "Ana Ruiz",
  phone: "5512345678",
  email: "ana@cincel.mx",
  puesto: "Diseñadora",
  emailSignature: "Ana Ruiz\nCincel",
  photoUrl: null,
  week: null,
};

function renderPerfil(patch: Partial<PerfilData> = {}, client = createTestQueryClient()) {
  return renderWithQueryClient(
    <PerfilClient initial={{ ...BASE, ...patch }}>
      <PerfilFoto />
      <PerfilDatos />
      <PerfilHorasSemana />
      <PerfilContrasena />
    </PerfilClient>,
    { client },
  );
}

/** A client whose `me.profile` is already seeded, as the shell does. */
function seededClient(photoUrl: string | null): ReturnType<typeof createTestQueryClient> {
  const client = createTestQueryClient();
  client.setQueryData<MyProfile>(qk.me.profile(), { id: BASE.staffId, name: BASE.name, photoUrl });
  return client;
}

function pickFile(file = new File(["x"], "foto.png", { type: "image/png" })) {
  const input = screen.getByLabelText("Elegir una foto") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.photoFlags.removeMyPhotoAction = true;
  mocks.reencodePhoto.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  mocks.uploadMyPhoto.mockResolvedValue("/api/staff/00000000-0000-0000-0000-0000000000aa/photo?v=abcdef12");
  mocks.removeMyPhotoAction.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("Perfil photo", () => {
  it("re-encodes the picked file, uploads it and refreshes the shell", async () => {
    renderPerfil();
    const file = pickFile();
    await waitFor(() => expect(mocks.uploadMyPhoto).toHaveBeenCalledTimes(1));
    expect(mocks.reencodePhoto).toHaveBeenCalledWith(file);
    expect(mocks.uploadMyPhoto).toHaveBeenCalledWith(await mocks.reencodePhoto.mock.results[0].value);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Foto actualizada");
    // The new photo can be removed right away.
    expect(screen.getByRole("button", { name: "Quitar" })).toBeTruthy();
  });

  it.each([
    ["TOO_LARGE", "La imagen pesa más de 2 MB. Elige una más ligera."],
    ["INVALID_TYPE", "Ese archivo no es una imagen. Usa JPG, PNG o WebP."],
    ["RATE_LIMITED", "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo."],
  ])("shows the %s copy when the upload route refuses the photo", async (code, copy) => {
    mocks.uploadMyPhoto.mockRejectedValue(new Error(code));
    renderPerfil();
    pickFile();
    expect((await screen.findByRole("alert")).textContent).toContain(copy);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows the INVALID_TYPE copy when the file can't be re-encoded and never uploads it", async () => {
    mocks.reencodePhoto.mockRejectedValue(new Error("INVALID_TYPE"));
    renderPerfil();
    pickFile(new File(["%PDF"], "doc.pdf", { type: "application/pdf" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ese archivo no es una imagen. Usa JPG, PNG o WebP.");
    expect(mocks.uploadMyPhoto).not.toHaveBeenCalled();
  });

  it("removes the photo with removeMyPhotoAction", async () => {
    renderPerfil({ photoUrl: "/api/staff/x/photo?v=1" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    });
    expect(mocks.removeMyPhotoAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("writes the uploaded photo into me.profile", async () => {
    const client = seededClient(null);
    renderPerfil({}, client);
    pickFile();
    await waitFor(() =>
      expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBe(
        "/api/staff/00000000-0000-0000-0000-0000000000aa/photo?v=abcdef12",
      ),
    );
  });

  it("sets me.profile.photoUrl to null after removing the photo", async () => {
    const client = seededClient("/api/staff/x/photo?v=1");
    renderPerfil({ photoUrl: "/api/staff/x/photo?v=1" }, client);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    });
    await waitFor(() => expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBeNull());
  });

  it("has no Quitar button without a photo or while removeMyPhotoAction is a stub", () => {
    renderPerfil();
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
    cleanup();
    mocks.photoFlags.removeMyPhotoAction = false;
    renderPerfil({ photoUrl: "/api/staff/x/photo?v=1" });
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
  });
});

describe("Mis horas esta semana", () => {
  it("is absent when time tracking is not enabled", () => {
    renderPerfil({ week: null });
    expect(screen.queryByText("Mis horas esta semana")).toBeNull();
  });

  it("shows this week's hours against the target when enabled", () => {
    renderPerfil({
      week: { days: [{ date: "2026-11-02", hours: 8 }], total: 32.5, target: 40 },
    });
    expect(screen.getByText("Mis horas esta semana")).toBeTruthy();
    expect(screen.getByText("32.5 h de 40 h")).toBeTruthy();
  });

  it("formats the line without a target", () => {
    expect(formatWeekHoursLine({ days: [], total: 6, target: 0 })).toBe("6 h");
  });
});

describe("Perfil fields", () => {
  it("keeps puesto, correo, idioma and zona horaria read-only", () => {
    renderPerfil();
    for (const label of ["Puesto", "Correo", "Idioma", "Zona horaria"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).readOnly).toBe(true);
    }
    expect((screen.getByLabelText("Puesto") as HTMLInputElement).value).toBe("Diseñadora");
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@cincel.mx");
    expect((screen.getByLabelText("Idioma") as HTMLInputElement).value).toBe("Español (México)");
    expect((screen.getByLabelText("Zona horaria") as HTMLInputElement).value).toContain("America/Mexico_City");
    for (const label of ["Nombre", "Teléfono", "Firma de correo"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).readOnly).toBe(false);
    }
  });

  it("shows 'Sin puesto' when the person has none", () => {
    renderPerfil({ puesto: "" });
    expect((screen.getByLabelText("Puesto") as HTMLInputElement).value).toBe("Sin puesto");
  });

  it("saves nombre and teléfono through updateStaffAction and the firma through upsertStaffProfileAction", async () => {
    mocks.updateStaffAction.mockResolvedValue({ id: BASE.staffId, name: "Ana María Ruiz", phone: "5500000000" });
    mocks.upsertStaffProfileAction.mockResolvedValue({ emailSignature: "Ana María" });
    renderPerfil();

    const save = screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana María Ruiz " } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "5500000000" } });
    fireEvent.change(screen.getByLabelText("Firma de correo"), { target: { value: "Ana María" } });
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Perfil guardado"));
    expect(mocks.updateStaffAction).toHaveBeenCalledWith(BASE.staffId, { name: "Ana María Ruiz", phone: "5500000000" });
    expect(mocks.upsertStaffProfileAction).toHaveBeenCalledWith(BASE.staffId, { emailSignature: "Ana María" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("only calls the action of what changed", async () => {
    mocks.upsertStaffProfileAction.mockResolvedValue({ emailSignature: null });
    renderPerfil();
    fireEvent.change(screen.getByLabelText("Firma de correo"), { target: { value: "  " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    });
    await waitFor(() => expect(mocks.upsertStaffProfileAction).toHaveBeenCalledWith(BASE.staffId, { emailSignature: null }));
    expect(mocks.updateStaffAction).not.toHaveBeenCalled();
  });

  it("asks for a name instead of saving an empty one", async () => {
    renderPerfil();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "   " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    });
    expect(screen.getByText("Escribe tu nombre.")).toBeTruthy();
    expect(screen.getByLabelText("Nombre").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.updateStaffAction).not.toHaveBeenCalled();
  });

  it("shows the action error copy when saving fails", async () => {
    mocks.updateStaffAction.mockRejectedValue(new Error("INVALID: name"));
    renderPerfil();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Otra" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
  });

  it("Cancelar restores the saved values", () => {
    renderPerfil();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Otra" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Ana Ruiz");
  });
});

describe("Cambiar contraseña", () => {
  it("changes the password with the existing action and clears the form", async () => {
    mocks.changePasswordAction.mockResolvedValue({ ok: true });
    renderPerfil();
    fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: "vieja-123" } });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "nueva-12345" } });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: "nueva-12345" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));
    });
    expect(mocks.changePasswordAction).toHaveBeenCalledWith("vieja-123", "nueva-12345", "nueva-12345");
    expect((await screen.findByRole("status")).textContent).toBe("Contraseña actualizada correctamente.");
    expect((screen.getByLabelText("Contraseña actual") as HTMLInputElement).value).toBe("");
  });

  it("shows the same copy as /profile for a refused change", async () => {
    mocks.changePasswordAction.mockResolvedValue({ ok: false, reason: "invalid_current_password" });
    renderPerfil();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("La contraseña actual no es correcta.");
  });

  it("maps every reason to its copy", () => {
    expect(passwordChangeErrorText("password_login_disabled")).toBe("El acceso con contraseña está desactivado. Entra con Google.");
    expect(passwordChangeErrorText("password_too_short")).toBe("La nueva contraseña debe tener al menos 8 caracteres.");
    expect(passwordChangeErrorText("password_confirmation_mismatch")).toBe("La confirmación no coincide con la nueva contraseña.");
    expect(passwordChangeErrorText("no_session")).toBe("Tu sesión expiró. Inicia sesión de nuevo.");
    expect(passwordChangeErrorText("otra")).toBe("No fue posible actualizar la contraseña.");
  });
});

describe("initialsOf", () => {
  it("takes the first and last initials", () => {
    expect(initialsOf("Ana María Ruiz")).toBe("AR");
    expect(initialsOf("ana")).toBe("AN");
    expect(initialsOf("  ")).toBe("?");
  });
});

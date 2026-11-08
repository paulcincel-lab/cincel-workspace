// @vitest-environment happy-dom
import { cleanup } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/profile-photo-actions.flags", () => ({ IMPLEMENTED: { removeMyPhotoAction: true } }));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => ({ updateStaffAction: vi.fn(), upsertStaffProfileAction: vi.fn() }));
vi.mock("@/lib/auth/auth-actions", () => ({ changePasswordAction: vi.fn() }));
vi.mock("@/lib/profile-photo/reencode", () => ({ reencodePhoto: vi.fn(), uploadMyPhoto: vi.fn() }));

// Contract-shaped stand-ins for the shared patterns (FE §4.11).
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

import { renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS } from "@/lib/ui/themes";

import { PerfilClient, PerfilContrasena, PerfilDatos, PerfilFoto, PerfilHorasSemana, type PerfilData } from "./PerfilClient";

const DATA: PerfilData = {
  staffId: "00000000-0000-0000-0000-0000000000aa",
  name: "Ana Ruiz",
  phone: "",
  email: "ana@cincel.mx",
  puesto: "Diseñadora",
  emailSignature: "",
  photoUrl: "/api/staff/00000000-0000-0000-0000-0000000000aa/photo?v=abcdef12",
  week: { days: [], total: 12, target: 40 },
};

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide; the token pairs are
  // covered by `CONTRAST_PAIRS` / `checkContrast` in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
});

describe("Ajustes › Perfil accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        const html = document.documentElement;
        html.setAttribute("data-theme-id", theme);
        html.setAttribute("data-theme", mode);
        html.classList.toggle("dark", mode === "dark");

        const { container } = renderWithQueryClient(
          <main>
            <h1>Ajustes</h1>
            <PerfilClient initial={DATA}>
              <PerfilFoto />
              <PerfilDatos />
              <PerfilHorasSemana />
              <PerfilContrasena />
            </PerfilClient>
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("labels every field and ties the hints to their inputs", () => {
    const { container, getByLabelText } = renderWithQueryClient(
      <PerfilClient initial={DATA}>
        <PerfilFoto />
        <PerfilDatos />
        <PerfilContrasena />
      </PerfilClient>,
    );
    const labelTargets = new Set(Array.from(container.querySelectorAll("label")).map((label) => label.htmlFor));
    for (const input of Array.from(container.querySelectorAll("input:not([type=file]), textarea"))) {
      const id = input.getAttribute("id");
      expect(id ? labelTargets.has(id) : false).toBe(true);
    }
    const current = getByLabelText("Contraseña actual");
    const help = document.getElementById(current.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toContain("Necesaria para confirmar");
    expect(getByLabelText("Elegir una foto").getAttribute("aria-describedby")).toBeTruthy();
  });
});

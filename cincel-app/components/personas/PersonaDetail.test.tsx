// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas/equipo/s-paul",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/tramos/compat", () => ({
  tramoLabel: (key: string) => ({ presale: "Presale", diseno: "Diseño", construccion: "Construcción" })[key] ?? key,
  tramoColorVar: (key: string) =>
    ({ presale: "var(--chart-1)", diseno: "var(--chart-2)", construccion: "var(--chart-3)" })[key] ?? "var(--muted-foreground)",
  tramoColorSlot: (key: string) => ({ presale: 1, diseno: 2, construccion: 3 })[key] ?? null,
  phaseLabel: () => null,
  canSeeAdminData: () => false,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { HOURS_STAT_KEY, PersonaDetail, visibleStats } from "./PersonaDetail";
import { ADMIN_TASK_TITLE, personaDetailFixture } from "./persona-detail.fixtures";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderIn(style: PresentationStyle, viewer: { canSeeAdminData: boolean; canViewHours: boolean }) {
  return render(
    <StyleProvider style={style} scope="staff">
      <PersonaDetail detail={personaDetailFixture(viewer)} />
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("visibleStats", () => {
  it("drops the hours stat when the server returns no hours", () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    // Even if a stray hours KPI came back, null weekHours hides it.
    detail.stats.push({ key: HOURS_STAT_KEY, label: "Horas esta semana", value: 0 });
    expect(visibleStats(detail).map((s) => s.key)).toEqual(["abiertas", "vencidas", "proyectos_activos"]);
  });

  it("keeps the hours stat when the server returns hours", () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: true });
    expect(visibleStats(detail).map((s) => s.key)).toContain(HOURS_STAT_KEY);
  });
});

describe("PersonaDetail", () => {
  it("renders the header with name, puesto, tramo and contact links", () => {
    renderIn("visual", { canSeeAdminData: false, canViewHours: false });
    expect(screen.getByRole("heading", { level: 1, name: "Paul Langarica Soubic" })).toBeTruthy();
    expect(screen.getByText("Residente de obra · Construcción")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Correo" }).getAttribute("href")).toBe("mailto:paul@cincel.example");
    expect(screen.getByRole("link", { name: "Llamar" }).getAttribute("href")).toBe("tel:+52 646 000 0000");
    const cutto = screen.getByRole("link", { name: /Abrir chat en Cutto/ });
    expect(cutto.getAttribute("href")).toContain(encodeURIComponent("paul@cincel.example"));
    expect(cutto.getAttribute("target")).toBe("_blank");
    expect(cutto.getAttribute("rel")).toContain("noopener");
  });

  it("omits contact links the staff record does not have", () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    detail.staff.email = null;
    detail.staff.phone = "  ";
    render(<PersonaDetail detail={detail} />);
    expect(screen.queryByRole("link", { name: "Correo" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Llamar" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Abrir chat en Cutto/ })).toBeNull();
  });

  it.each(STYLES)("hides the hours stat when the server returns null (%s)", (style) => {
    const { container } = renderIn(style, { canSeeAdminData: false, canViewHours: false });
    expect(container.textContent).not.toContain("Horas esta semana");
  });

  it("shows the hours stat when the server returns hours", () => {
    const { container } = renderIn("visual", { canSeeAdminData: false, canViewHours: true });
    expect(container.textContent).toContain("Horas esta semana");
  });

  it.each(STYLES)("renders no admin task for a non-admin viewer (B8, %s)", (style) => {
    const { container } = renderIn(style, { canSeeAdminData: false, canViewHours: false });
    expect(container.textContent).toContain("Cambiar tapas a WC con rosca metálica");
    expect(container.textContent).not.toContain(ADMIN_TASK_TITLE);
  });

  it("renders the admin task only when the server returned it (canSeeAdminData)", () => {
    const { container } = renderIn("visual", { canSeeAdminData: true, canViewHours: false });
    expect(container.textContent).toContain(ADMIN_TASK_TITLE);
  });

  it.each(STYLES)("renders stats, tasks, projects and availability from the same data (%s)", (style) => {
    const { container } = renderIn(style, { canSeeAdminData: false, canViewHours: true });
    const text = container.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: "Paul Langarica Soubic" })).toBeTruthy();
    for (const copy of [
      "Tareas abiertas",
      "Vencidas",
      "Horas esta semana",
      "Tareas asignadas",
      "Cambiar tapas a WC con rosca metálica",
      "Medir muro del fondo de cocina",
      "Proyectos",
      "Local Espinopapa",
      "Ensenada",
      "Disponibilidad esta semana",
    ]) {
      expect(text).toContain(copy);
    }
  });

  it("links the task list to the person's tasks", () => {
    renderIn("visual", { canSeeAdminData: false, canViewHours: false });
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/tareas?vista=lista&responsable=s-paul");
  });
});

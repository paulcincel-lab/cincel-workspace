// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { attentionCaption, heroSentence, projectChip } from "@/lib/inicio/visual";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { InicioData } from "@/lib/types/redesign";

import { InicioVisual } from "./InicioVisual";
import { INICIO_EMPTY } from "./inicio-fixtures";
import { INICIO_VISUAL, VISUAL_NOW } from "./inicio-visual-fixtures";

function renderVisual(data: InicioData = INICIO_VISUAL) {
  return renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <InicioVisual data={data} me={{ firstName: "Oscar" }} renderedAt={new Date(VISUAL_NOW)} />
    </StyleProvider>,
    { client: createTestQueryClient() },
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const hero = () => within(screen.getByRole("region", { name: "Saludo" }));

describe("InicioVisual", () => {
  it("renders the header and the hero greeting", () => {
    renderVisual();
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Oscar" })).toBeTruthy();
    expect(screen.getByText("Lunes 9 de noviembre · cómo va el despacho, de un vistazo.")).toBeTruthy();
    expect(hero().getByRole("heading", { level: 2, name: "Buenos días, Oscar" })).toBeTruthy();
    expect(hero().getByText("lunes 9 nov")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe("/tareas?nueva=1");
  });

  it("hero sentence plural and zero", () => {
    expect(heroSentence(INICIO_VISUAL.hero)).toBe(
      "Hoy vencen 4 entregas y hay 7 tareas atrasadas en 3 proyectos. Oficina Polanco necesita atención.",
    );
    expect(
      heroSentence({ dueToday: 1, overdue: 1, overdueProjects: 1, focusProject: { id: "p", name: "Casa", href: "/proyectos/p" } }),
    ).toBe("Hoy vence 1 entrega y hay 1 tarea atrasada en 1 proyecto. Casa necesita atención.");
    expect(heroSentence({ dueToday: 0, overdue: 0, overdueProjects: 0, focusProject: null })).toBe(
      "Hoy no vence ninguna entrega y no hay tareas atrasadas.",
    );

    renderVisual();
    expect(hero().getByText(heroSentence(INICIO_VISUAL.hero))).toBeTruthy();
    expect(hero().getByRole("link", { name: "Ver vencidas" }).getAttribute("href")).toBe("/tareas?mostrar=en_retraso");
    expect(hero().getByRole("link", { name: "Abrir Oficina Polanco" }).getAttribute("href")).toBe("/proyectos/p-1");
    expect(hero().getByText("entregas hoy")).toBeTruthy();
    cleanup();

    renderVisual({ ...INICIO_EMPTY });
    expect(hero().getByText("Hoy no vence ninguna entrega y no hay tareas atrasadas.")).toBeTruthy();
    // No focus project: no "Abrir" button; no team access: no avatars.
    expect(hero().queryByRole("link", { name: /^Abrir/ })).toBeNull();
    expect(hero().queryByText(/con jornada abierta/)).toBeNull();
  });

  it("avatars cap at 4 plus +N", () => {
    renderVisual();
    const region = screen.getByRole("region", { name: "Saludo" });
    const stack = region.querySelector('[data-slot="avatar-stack"]')!;
    expect(stack.getAttribute("aria-hidden")).toBe("true");
    expect(stack.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4);
    expect(stack.querySelector('[data-slot="avatar-extra"]')?.textContent).toBe("+2");
    expect(hero().getByText("6 personas con jornada abierta")).toBeTruthy();
  });

  it("tile delta tones", () => {
    renderVisual();
    const tone = (key: string) =>
      document.querySelector(`[data-kpi="${key}"] [data-slot="tile-delta"]`)?.getAttribute("data-tone");
    const text = (key: string) => document.querySelector(`[data-kpi="${key}"] [data-slot="tile-delta"]`)?.textContent;
    expect(tone("abiertas")).toBe("bad");
    expect(text("abiertas")).toBe("+3");
    expect(tone("vencidas")).toBe("good");
    expect(text("vencidas")).toBe("−2");
    expect(tone("proyectos_activos")).toBe("neutral");
    expect(text("proyectos_activos")).toBe("±0");
    expect(tone("horas_semana")).toBe("good");
    expect(text("horas_semana")).toBe("+4 h");
    expect(document.querySelector('[data-kpi="horas_semana"] [data-slot="tile-value"]')?.textContent).toBe("126 h");
    // Each tile draws its 7-day sparkline.
    expect(document.querySelectorAll('[data-slot="tile-sparkline"] polyline.draw')).toHaveLength(4);
  });

  it("attention caption variants", () => {
    const [late, blocked, noSubtasks] = INICIO_VISUAL.attention;
    expect(attentionCaption(late)).toBe("2 de 5 subtareas");
    expect(attentionCaption(blocked)).toBe("0 de 3 subtareas · 7 d tarde");
    expect(attentionCaption(noSubtasks)).toBe("Sin subtareas");

    renderVisual();
    const section = within(screen.getByRole("region", { name: "Requiere atención" }));
    const cards = section.getAllByRole("link").filter((a) => a.getAttribute("data-slot") === "attention-card");
    // The first 3 items only.
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/tareas?tarea=t-1", "/tareas?tarea=t-2", "/tareas?tarea=t-3"]);
    expect(within(cards[0]).getByText("12 d tarde").getAttribute("data-tone")).toBe("destructive");
    expect(within(cards[0]).getByText("Oficina Polanco · Ana Ruiz")).toBeTruthy();
    expect(within(cards[1]).getByText("Bloqueado")).toBeTruthy();
    expect(within(cards[2]).getByText("3 d tarde").getAttribute("data-tone")).toBe("warning");
    expect(section.getByRole("link", { name: "Ver todas →" }).getAttribute("href")).toBe("/tareas?mostrar=en_retraso");
  });

  it("project chip Al día", () => {
    expect(projectChip(INICIO_VISUAL.projectsProgress[1])).toEqual({ text: "Al día", tone: "success" });
    expect(projectChip(INICIO_VISUAL.projectsProgress[0])).toEqual({ text: "4 vencidas", tone: "destructive" });

    renderVisual();
    const card = within(screen.getByRole("region", { name: "Proyectos en curso" }));
    const links = card.getAllByRole("link").filter((a) => a.getAttribute("data-slot") === "project-card");
    // Most overdue first.
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/proyectos/p-1", "/proyectos/p-2"]);
    expect(within(links[0]).getByText("4 vencidas")).toBeTruthy();
    expect(within(links[0]).getByText("Diseño · entrega 28 nov")).toBeTruthy();
    expect(within(links[1]).getByText("Al día")).toBeTruthy();
    // Up to 3 avatars plus "+1".
    expect(links[0].querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
    expect(links[0].querySelector('[data-slot="avatar-extra"]')?.textContent).toBe("+1");
    expect(card.getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe("/proyectos");
  });

  it("project and attention cards lift on hover and focus; KPI tiles (no link) do not", () => {
    const { container } = renderVisual();
    const projects = [...container.querySelectorAll<HTMLElement>('[data-slot="project-card"]')];
    expect(projects.length).toBeGreaterThan(1);
    for (const card of projects) {
      expect(card.classList.contains("lift")).toBe(true);
      expect(card.className).toContain("focus-within:");
      expect(card.classList.contains("anim-in")).toBe(true);
    }
    expect(projects.map((card) => card.style.getPropertyValue("--anim-delay"))).toEqual(["0ms", "60ms"]);
    for (const card of container.querySelectorAll('[data-slot="attention-card"]')) expect(card.classList.contains("lift")).toBe(true);
    for (const tile of container.querySelectorAll('[data-slot="inicio-tile"]')) expect(tile.classList.contains("lift")).toBe(false);
  });

  it("shows the team agenda with team access and the viewer's day without it", () => {
    renderVisual();
    const agenda = within(screen.getByRole("region", { name: "Agenda de hoy" }));
    expect(agenda.getByText("Entrega de fachada")).toBeTruthy();
    expect(agenda.getByText("09:00")).toBeTruthy();
    cleanup();

    renderVisual({ ...INICIO_VISUAL, openShifts: null });
    const mine = within(screen.getByRole("region", { name: "Agenda de hoy" }));
    expect(mine.getByText("Visita de obra")).toBeTruthy();
    expect(mine.queryByText("Entrega de fachada")).toBeNull();
  });

  it("shows the empty copy of each section", () => {
    renderVisual({ ...INICIO_EMPTY });
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("Sin eventos hoy")).toBeTruthy();
    expect(screen.getByText("No hay proyectos activos")).toBeTruthy();
  });
});

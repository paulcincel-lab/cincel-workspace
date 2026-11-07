// @vitest-environment happy-dom
/**
 * Stub phase (redesign FE §17, §20 Rule 1): with every `IMPLEMENTED` flag
 * false and the read actions disabled / empty, the shell renders no nav item,
 * slot or button that would call a write stub. One test per domain.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { allFalse } = vi.hoisted(() => ({
  allFalse: (actual: unknown) => {
    const flags = (actual as { IMPLEMENTED: Record<string, boolean> }).IMPLEMENTED;
    return { IMPLEMENTED: Object.fromEntries(Object.keys(flags).map((key) => [key, false])) };
  },
}));

vi.mock("@/lib/actions/assistant-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/dashboard-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/gmail-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/my-space-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/notifications-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/org-appearance-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/people-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/preferences-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/profile-photo-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/projects-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/search-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/time-tracking-actions.flags", async (actual) => allFalse(await actual()));
vi.mock("@/lib/actions/vacations-actions.flags", async (actual) => allFalse(await actual()));

vi.mock("next/navigation", () => ({
  usePathname: () => "/proyectos",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/tramos/compat", () => ({
  listTramos: async () => [{ id: "w1", key: "presale", name: "Presale", sortOrder: 1 }],
  tramoColorVar: () => "var(--chart-1)",
}));
// Markers: these entry points would call stubs, so the shell must not mount them.
vi.mock("@/components/shell/CommandPalette", () => ({ CommandPalette: () => <div data-testid="command-palette" /> }));
vi.mock("@/components/asistente/AssistantButton", () => ({
  AssistantButton: () => <div data-testid="assistant-button" />,
}));
vi.mock("@/components/asistente/AssistantSheet", () => ({ AssistantSheet: () => <div data-testid="assistant-sheet" /> }));
vi.mock("@/components/shell/SidebarSlotOutlet", () => ({
  SidebarSlotOutlet: ({ slot }: { slot: { name: string } }) => <div data-testid={`slot-${slot.name}`} />,
}));

import { AppShell } from "../AppShell";
import { buildNavModel, type NavModel } from "@/lib/ui/nav";
import type { ResolvedAppearance } from "@/lib/types/redesign";

import { ADMIN_SESSION, TODAY_ON } from "./shell-fixtures";

const APPEARANCE: ResolvedAppearance = {
  theme: "azul",
  mode: "light",
  style: "visual",
  density: "comoda",
  textSize: 14,
  redesignEnabled: true,
  cssVars: { light: {}, dark: {} },
  version: 1,
};

let nav: NavModel;

beforeAll(async () => {
  // The real registry: every source either reports hidden or fails (and is hidden).
  nav = await buildNavModel(ADMIN_SESSION);
});

function renderShell() {
  // Worst case: the day status says enabled even though the clock is a stub.
  render(
    <AppShell appearance={APPEARANCE} session={ADMIN_SESSION} nav={nav} today={TODAY_ON}>
      <h1>Proyectos</h1>
    </AppShell>,
  );
}

const link = (name: string | RegExp) => () => screen.queryByRole("link", { name });
const button = (name: string | RegExp) => () => screen.queryByRole("button", { name });
const testId = (id: string) => () => screen.queryByTestId(id);
const selector = (css: string) => () => document.querySelector(css);

type Domain = { domain: string; absent: (() => Element | null)[] };

const DOMAINS: Domain[] = [
  { domain: "search", absent: [button(/Buscar/), testId("command-palette")] },
  {
    domain: "time-tracking",
    absent: [selector("[data-slot=sidebar-time-clock]"), button("Registrar entrada"), button("Pausa"), button("Salida")],
  },
  { domain: "notifications", absent: [testId("slot-bandeja-badge")] },
  { domain: "assistant", absent: [testId("assistant-button"), testId("assistant-sheet"), link(/^Asistente/)] },
  { domain: "dashboard", absent: [link(/^Inicio/)] },
  { domain: "my-space", absent: [link(/^Mi espacio/)] },
  { domain: "gmail", absent: [button(/Gmail/), link(/Gmail/)] },
  { domain: "projects", absent: [link(/^Proyectos/), button("Nuevo proyecto")] },
  { domain: "people", absent: [link(/^Personas/)] },
  { domain: "vacations", absent: [button(/vacaciones/i), link(/Mis vacaciones/)] },
  { domain: "org-appearance", absent: [button("Editar tema de la organización"), link("Editar tema de la organización")] },
  { domain: "preferences", absent: [button("Volver al diseño anterior"), button("Probar el nuevo diseño")] },
  { domain: "profile-photo", absent: [button(/foto/i)] },
];

afterEach(() => cleanup());

describe("shell in the stub phase", () => {
  it("still renders the shell around the page", () => {
    renderShell();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proyectos" })).toBeTruthy();
  });

  it("builds a nav model without items hidden behind a false flag", () => {
    const keys = [...nav.items, ...nav.footer].map((item) => item.key);
    for (const hidden of ["inicio", "mi-espacio", "proyectos", "personas", "asistente"] as const) {
      expect(keys).not.toContain(hidden);
    }
  });

  it.each(DOMAINS)("renders no entry point of $domain that would call a write stub", ({ absent }) => {
    renderShell();
    for (const query of absent) expect(query()).toBeNull();
  });
});

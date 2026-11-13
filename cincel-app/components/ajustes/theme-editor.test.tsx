// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS, THEME_LABELS, THEME_PRESETS } from "@/lib/ui/themes";
import { applyPreset, failingColorsText, publishLowContrastQuestion } from "@/lib/ui/theme-editor";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
  flags: { fetchOrgAppearanceAction: true, saveOrgAppearanceAction: true, resetOrgAppearanceAction: true },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesTemaPageData: vi.fn() }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn() }));
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  saveOrgAppearanceAction: mocks.save,
  resetOrgAppearanceAction: mocks.reset,
  fetchOrgAppearanceAction: vi.fn(),
}));
vi.mock("@/lib/actions/org-appearance-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));

// Contract-faithful pattern shells, so this file tests the editor and not the shells.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <section aria-label={title}>
      <h3>{title}</h3>
      {actions}
      {children}
    </section>
  ),
}));
vi.mock("@/components/patterns/SettingsRow", () => ({
  SettingsRow: (p: { label: string; description?: string; control: ReactNode; htmlFor?: string }) => (
    <div>
      <label htmlFor={p.htmlFor}>{p.label}</label>
      {p.description ? <span>{p.description}</span> : null}
      {p.control}
    </div>
  ),
}));
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (p: {
    title: string;
    description?: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    error?: string | null;
    children: ReactNode;
  }) =>
    p.open ? (
      <div role="dialog" aria-label={p.title}>
        <p>{p.description}</p>
        {p.children}
        {p.error ? <p role="alert">{p.error}</p> : null}
        <button type="button" onClick={() => p.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" onClick={() => void p.onSubmit()}>
          {p.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { ResolvedAppearance } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";

import { ThemeEditor } from "./ThemeEditor";
import { WEIGHTS } from "./TypeScaleRow";

const initial: OrgAppearance = THEME_PRESETS.azul;

let client: QueryClient;

/** The page as it hydrates: the published theme in `qk.ajustes.page('tema')`. */
function renderEditor(start: OrgAppearance = initial, wrap: (node: ReactNode) => ReactNode = (node) => node) {
  client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("tema"), { org: start });
  return renderWithQueryClient(<>{wrap(<ThemeEditor presets={THEME_PRESETS} />)}</>, { client });
}

function preview(): HTMLElement {
  return screen.getByTestId("theme-preview");
}

function previewStatus(): HTMLElement {
  return within(screen.getByRole("complementary", { name: "Vista previa" })).getByRole("status");
}

function saveBarStatus(): HTMLElement {
  return document.querySelector('[data-slot="settings-save-bar"] [role="status"]') as HTMLElement;
}

function publishButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Publicar para todos" }) as HTMLButtonElement;
}

function tokenInput(name: string): HTMLInputElement {
  return document.getElementById(`token-${name}`) as HTMLInputElement;
}

function tokenBadge(name: string): HTMLElement | null {
  return document.querySelector(`[data-token="${name}"] [data-slot="token-contrast"]`);
}

function presetRadio(id: ThemeId): HTMLElement {
  return within(screen.getByRole("radiogroup", { name: "Partir de un tema" })).getByRole("radio", {
    name: new RegExp(THEME_LABELS[id]),
  });
}

/** The draft published by the last save (the action's first argument). */
function savedDraft(): OrgAppearance {
  return mocks.save.mock.calls.at(-1)?.[0] as OrgAppearance;
}

beforeEach(() => {
  mocks.save.mockReset();
  mocks.save.mockImplementation(async (input: OrgAppearance) => input);
  mocks.reset.mockReset();
  mocks.refresh.mockReset();
  mocks.flags.saveOrgAppearanceAction = true;
  mocks.flags.resetOrgAppearanceAction = true;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThemeEditor layout", () => {
  it("shows the admin heading, the color sections with their counts and the preview aside", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: /Tema de la organización/ })).toBeTruthy();
    for (const [title, count] of [
      ["Interfaz", "19 COLORES"],
      ["Navegación", "8 COLORES"],
      ["Etapas y estatus", "21 COLORES"],
    ] as const) {
      expect(within(screen.getByRole("region", { name: title })).getByText(count)).toBeTruthy();
    }
    expect(within(screen.getByRole("complementary", { name: "Vista previa" })).getByText("VISTA PREVIA")).toBeTruthy();
  });

  it("shows 9 Interfaz colors until 'Ver los 19 colores' expands them", () => {
    renderEditor();
    const interfaz = screen.getByRole("region", { name: "Interfaz" });
    expect(interfaz.querySelectorAll("[data-token]")).toHaveLength(9);
    const more = within(interfaz).getByRole("button", { name: "Ver los 19 colores" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(interfaz.querySelectorAll("[data-token]")).toHaveLength(19);
    expect(within(interfaz).getByRole("button", { name: "Ver menos colores" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ThemeEditor live preview", () => {
  it("paints the preview with the edited token of the edited mode", () => {
    renderEditor();
    expect(preview().style.getPropertyValue("--primary")).toBe(initial.tokens.primary.light);

    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    expect(preview().style.getPropertyValue("--primary")).toBe("#1d4ed8");
    expect(tokenInput("primary").value).toBe("#1d4ed8");
  });

  it("edits a token through its hex chip, only once the value is a full color", () => {
    renderEditor();
    const chip = screen.getByRole("textbox", { name: "Valor de Botón principal" }) as HTMLInputElement;

    fireEvent.change(chip, { target: { value: "#1d4" } });
    expect(preview().style.getPropertyValue("--primary")).toBe(initial.tokens.primary.light);
    fireEvent.change(chip, { target: { value: "#1d4ed8" } });
    expect(preview().style.getPropertyValue("--primary")).toBe("#1d4ed8");

    fireEvent.change(chip, { target: { value: "azul" } });
    fireEvent.blur(chip);
    expect(chip.value).toBe("#1d4ed8");
  });

  it("edits the dark values after switching to Oscuro", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(preview().getAttribute("data-mode")).toBe("dark");
    expect(preview().style.getPropertyValue("--background")).toBe(initial.tokens.background.dark);

    fireEvent.change(tokenInput("background"), { target: { value: "#000000" } });
    expect(preview().style.getPropertyValue("--background")).toBe("#000000");

    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));
    expect(preview().style.getPropertyValue("--background")).toBe(initial.tokens.background.light);
  });

  it("applies type roles and the card shadow to the draft", async () => {
    renderEditor();
    const title = within(preview()).getByText("Buenos días");
    expect(title.style.fontSize).toBe(`${initial.typeScale.pageTitle.size}px`);

    fireEvent.change(document.getElementById("type-pageTitle") as HTMLInputElement, { target: { value: "30" } });
    expect(within(preview()).getByText("Buenos días").style.fontSize).toBe("30px");
    expect(screen.getByText(`${initial.shape.radius} px`)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Marcada" }));
    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(savedDraft().typeScale.pageTitle).toEqual({ ...initial.typeScale.pageTitle, size: 30 });
    expect(savedDraft().shape).toEqual({ ...initial.shape, shadow: "marcada" });
  });

  it("weights never exceed 600", () => {
    renderEditor();
    expect(WEIGHTS.map((w) => [w.value, w.label])).toEqual([
      [400, "Normal"],
      [500, "Media"],
      [600, "Seminegrita"],
    ]);
    for (const preset of Object.values(THEME_PRESETS)) {
      for (const role of Object.values(preset.typeScale)) expect(role.weight).toBeLessThanOrEqual(600);
    }
    for (const { label } of [{ label: "Título de página" }, { label: "Números KPI" }]) {
      expect(screen.getByRole("combobox", { name: `Peso de ${label}` })).toBeTruthy();
    }
  });
});

describe("ThemeEditor contrast", () => {
  it("contrast badges follow CONTRAST_PAIRS: a pass shows the ratio", () => {
    renderEditor();
    const badge = tokenBadge("foreground");
    expect(badge?.getAttribute("data-ok")).toBe("true");
    expect(badge?.textContent).toMatch(/^\d+\.\d:1$/);
    expect(previewStatus().getAttribute("data-ok")).toBe("true");
    expect(previewStatus().textContent).toMatch(/Contraste texto \/ fondo: \d+\.\d:1 · cumple 4\.5:1/);
  });

  it("failing contrast shows the badge and the save-bar warning", () => {
    renderEditor();
    expect(saveBarStatus().textContent).toBe("");

    fireEvent.change(tokenInput("muted-foreground"), { target: { value: "#c0c0c0" } });

    const row = document.querySelector('[data-token="muted-foreground"]');
    expect(row?.getAttribute("data-invalid")).toBe("true");
    expect(tokenInput("muted-foreground").getAttribute("aria-invalid")).toBe("true");
    expect(tokenBadge("muted-foreground")?.getAttribute("data-ok")).toBe("false");
    expect(tokenBadge("muted-foreground")?.textContent).toMatch(/^\d+\.\d:1 · no cumple 4\.5:1$/);
    expect(previewStatus().getAttribute("data-ok")).toBe("false");
    expect(saveBarStatus().textContent).toBe(`Cambios sin publicar · ${failingColorsText(1)}`);

    fireEvent.change(tokenInput("muted-foreground"), { target: { value: initial.tokens["muted-foreground"].light } });
    expect(document.querySelector('[data-token="muted-foreground"]')?.getAttribute("data-invalid")).toBeNull();
    expect(saveBarStatus().textContent).toBe("");
  });

  it("publish with failures asks first", async () => {
    renderEditor();
    fireEvent.change(tokenInput("muted-foreground"), { target: { value: "#c0c0c0" } });
    fireEvent.click(publishButton());

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(publishLowContrastQuestion(1))).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Revisar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.click(publishButton());
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[1]).toEqual({ acceptLowContrast: true });
  });

  it("publishes a passing theme without asking", async () => {
    renderEditor();
    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[1]).toEqual({ acceptLowContrast: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("ThemeEditor presets", () => {
  it.each(THEME_IDS)("'Partir de' %s loads the preset into a clean draft and it publishes unchanged", async (id: ThemeId) => {
    const start = THEME_PRESETS[id === "azul" ? "grafito" : "azul"];
    renderEditor(start);

    fireEvent.click(presetRadio(id));
    expect(presetRadio(id).getAttribute("aria-checked")).toBe("true");
    expect(preview().style.getPropertyValue("--background")).toBe(THEME_PRESETS[id].tokens.background.light);

    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(savedDraft()).toEqual(applyPreset(start, THEME_PRESETS[id]));
    // Published: the cache holds the saved theme, the draft matches it, no route refresh.
    await waitFor(() =>
      expect(client.getQueryData(qk.ajustes.page("tema"))).toEqual({ org: applyPreset(start, THEME_PRESETS[id]) }),
    );
    await waitFor(() => expect(saveBarStatus().textContent).toBe(""));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("partir de resets the draft after confirm", async () => {
    renderEditor();
    fireEvent.change(tokenInput("primary"), { target: { value: "#123456" } });

    fireEvent.click(presetRadio("calido"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("¿Partir de Cálido?")).toBeTruthy();
    expect(within(dialog).getByText("Se pierden los cambios sin publicar.")).toBeTruthy();
    // Nothing changes until it is confirmed.
    expect(preview().style.getPropertyValue("--primary")).toBe("#123456");

    fireEvent.click(within(dialog).getByRole("button", { name: "Partir de Cálido" }));
    await waitFor(() => expect(preview().style.getPropertyValue("--primary")).toBe(THEME_PRESETS.calido.tokens.primary.light));
    expect(presetRadio("calido").getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the organization style settings when a preset is applied", async () => {
    renderEditor({ ...initial, styleDefault: "analitico", allowUserOverride: false });
    fireEvent.click(presetRadio("grafito"));
    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(savedDraft()).toMatchObject({ baseTheme: "grafito", styleDefault: "analitico", allowUserOverride: false });
  });

  it("binds the style cards and the organization switch", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: /Esencial/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Permitir que cada persona elija su estilo y tema" }));
    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(savedDraft()).toMatchObject({ styleDefault: "esencial", allowUserOverride: !initial.allowUserOverride });
  });
});

describe("ThemeEditor publish updates the page theme at once", () => {
  afterEach(() => {
    document.getElementById("appearance")?.remove();
    const root = document.documentElement;
    for (const attr of ["data-mode", "data-theme", "data-theme-id", "data-style", "data-density"]) root.removeAttribute(attr);
    root.classList.remove("dark");
  });

  function withAppearance(org: OrgAppearance) {
    const resolved: ResolvedAppearance = resolveAppearance({ ...org, v: 1 }, null);
    return function WithAppearance(node: ReactNode) {
      return <AppearanceStoreProvider initial={resolved}>{node}</AppearanceStoreProvider>;
    };
  }

  it("publish → the appearance store and <html> (<style id=appearance>, data-theme-id) follow the new theme, no refresh", async () => {
    renderEditor(initial, withAppearance(initial));
    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    fireEvent.click(publishButton());

    await waitFor(() => expect(document.getElementById("appearance")?.textContent).toContain("#1d4ed8"));
    expect(document.documentElement.getAttribute("data-theme-id")).toBe(initial.baseTheme);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("reset → <html> shows the preset of the base theme", async () => {
    const customized = structuredClone(THEME_PRESETS.calido);
    customized.tokens.primary.light = "#123456";
    mocks.reset.mockResolvedValue(THEME_PRESETS.calido);
    renderEditor(customized, withAppearance(customized));

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restablecer" }));

    await waitFor(() =>
      expect(document.getElementById("appearance")?.textContent).toContain(THEME_PRESETS.calido.tokens.primary.light),
    );
    expect(document.getElementById("appearance")?.textContent).not.toContain("#123456");
    expect(document.documentElement.getAttribute("data-theme-id")).toBe("calido");
    expect(client.getQueryData(qk.ajustes.page("tema"))).toEqual({ org: THEME_PRESETS.calido });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("ThemeEditor reset", () => {
  it("asks for confirmation before calling resetOrgAppearanceAction(base)", async () => {
    mocks.reset.mockResolvedValue(THEME_PRESETS.calido);
    renderEditor(THEME_PRESETS.calido);

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    const dialog = screen.getByRole("dialog", { name: "¿Restablecer el tema?" });
    expect(mocks.reset).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restablecer" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("calido"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows FORBIDDEN in the dialog when the reset is refused", async () => {
    mocks.reset.mockRejectedValue(new Error("FORBIDDEN: appearance edit"));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restablecer" }));
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });
});

describe("ThemeEditor export", () => {
  it("downloads the resolved :root and .dark blocks", async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:tema";
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderEditor();
    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSS" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(blob).not.toBeNull();
    const css = await (blob as unknown as Blob).text();
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--primary: #1d4ed8;");
    expect(css).toContain(`--primary: ${initial.tokens.primary.dark};`);
  });
});

describe("ThemeEditor server errors", () => {
  it.each([
    ["FORBIDDEN: appearance edit", "No tienes permiso para realizar esta acción."],
    ["INVALID: tokens", "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo."],
  ])("shows the copy of %s above the save bar", async (message, copy) => {
    mocks.save.mockRejectedValue(new Error(message));
    renderEditor();
    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    await act(async () => {
      fireEvent.click(publishButton());
    });
    expect(await screen.findByText(copy)).toBeTruthy();
  });
});

describe("ThemeEditor entry points", () => {
  it("hides publish and reset while their actions are not implemented", () => {
    mocks.flags.saveOrgAppearanceAction = false;
    mocks.flags.resetOrgAppearanceAction = false;
    renderEditor();
    expect(screen.queryByRole("button", { name: "Publicar para todos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar CSS" })).toBeTruthy();
  });

  it("does nothing on Publicar while the draft is clean", () => {
    renderEditor();
    expect(publishButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(publishButton());
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

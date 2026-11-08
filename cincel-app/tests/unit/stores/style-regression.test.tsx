// @vitest-environment happy-dom
/**
 * Style desync regression (zustand.md §0 finding 3, D2, Phase 2 #936):
 * changing Estilo on Inicio, then opening Personas or Biblioteca (no
 * `?estilo`), shows the new style without a reload, and `html[data-style]`
 * matches. The pages have no nested `StyleProvider`: every `useStyle()`
 * reads the root appearance store, plus the `?estilo=` URL override, which
 * the staff shell ignores when the organization fixes the style.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.search }));
vi.mock("@/lib/actions/preferences-actions.flags", () => ({
  IMPLEMENTED: { fetchMyPreferencesAction: true, updateMyPreferencesAction: true },
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: mocks.update,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { useStyle } from "@/components/shell/StyleProvider";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { PresentationStyle, ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

function prefs(style: PresentationStyle | null): UserPreferences {
  return { theme: null, mode: "light", style, density: "comoda", textSize: 14, quietHours: null };
}

function resolved(style: PresentationStyle | null, allowUserOverride = true): ResolvedAppearance {
  return resolveAppearance({ ...THEME_PRESETS.azul, allowUserOverride, v: 1 }, prefs(style));
}

/** A page body: what its widgets render through `useStyle()`. */
function PageStyle({ id }: { id: string }) {
  const { style, isOverridden } = useStyle();
  return <p data-testid={id}>{`${style}${isOverridden ? " (url)" : ""}`}</p>;
}

function Inicio() {
  return (
    <>
      <EstiloSwitch />
      <PageStyle id="inicio" />
    </>
  );
}

/** The root store stays mounted while the client navigates between pages, as in the app. */
function App({ fixedByOrg = false, initial }: { fixedByOrg?: boolean; initial: ResolvedAppearance }) {
  const [page, setPage] = useState<"inicio" | "personas" | "biblioteca">("inicio");
  return (
    <AppearanceStoreProvider initial={initial} fixedByOrg={fixedByOrg}>
      <nav>
        <button type="button" onClick={() => setPage("personas")}>
          Personas
        </button>
        <button type="button" onClick={() => setPage("biblioteca")}>
          Biblioteca
        </button>
      </nav>
      {page === "inicio" ? <Inicio /> : <PageStyle id={page} />}
    </AppearanceStoreProvider>
  );
}

beforeEach(() => {
  mocks.search = new URLSearchParams();
  mocks.update.mockReset().mockImplementation(async (patch: Partial<UserPreferences>) => ({
    preferences: prefs(patch.style ?? null),
    appearance: resolved(patch.style ?? null),
  }));
  document.documentElement.removeAttribute("data-style");
});

afterEach(() => cleanup());

describe("style regression: a change on one page is read on the next", () => {
  it("Estilo on Inicio, then Personas and Biblioteca show the new style, no reload; html[data-style] matches", async () => {
    render(<App initial={resolved("visual")} />);
    expect(screen.getByTestId("inicio").textContent).toBe("visual");

    fireEvent.click(screen.getByRole("radio", { name: "Analítico" }));
    expect(screen.getByTestId("inicio").textContent).toBe("analitico");
    expect(document.documentElement.getAttribute("data-style")).toBe("analitico");
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ style: "analitico" }));

    fireEvent.click(screen.getByRole("button", { name: "Personas" }));
    expect(screen.getByTestId("personas").textContent).toBe("analitico");
    fireEvent.click(screen.getByRole("button", { name: "Biblioteca" }));
    expect(screen.getByTestId("biblioteca").textContent).toBe("analitico");
    expect(document.documentElement.getAttribute("data-style")).toBe("analitico");
    // One save POST, nothing else.
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("rolls the style back everywhere when the save fails", async () => {
    mocks.update.mockRejectedValue(new Error("FORBIDDEN"));
    render(<App initial={resolved("visual")} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Esencial" }));
    });
    await waitFor(() => expect(screen.getByTestId("inicio").textContent).toBe("visual"));
    fireEvent.click(screen.getByRole("button", { name: "Personas" }));
    expect(screen.getByTestId("personas").textContent).toBe("visual");
  });
});

describe("the ?estilo= override comes from the URL", () => {
  it("shows the URL style as a preview without touching the store", () => {
    mocks.search = new URLSearchParams("estilo=esencial");
    render(<App initial={resolved("visual")} />);
    expect(screen.getByTestId("inicio").textContent).toBe("esencial (url)");

    // The next page has no ?estilo: back to the saved style.
    mocks.search = new URLSearchParams();
    fireEvent.click(screen.getByRole("button", { name: "Personas" }));
    expect(screen.getByTestId("personas").textContent).toBe("visual");
  });

  it("does not persist a change made while previewing", () => {
    mocks.search = new URLSearchParams("estilo=esencial");
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    render(<App initial={resolved("visual")} />);
    fireEvent.click(screen.getByRole("radio", { name: "Analítico" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(String(replace.mock.calls.at(-1)?.[2])).toContain("estilo=analitico");
    replace.mockRestore();
  });

  it("ignores an unknown ?estilo=", () => {
    mocks.search = new URLSearchParams("estilo=otro");
    render(<App initial={resolved("analitico")} />);
    expect(screen.getByTestId("inicio").textContent).toBe("analitico");
  });
});

describe("the organization fixes the style (fixedByOrg)", () => {
  it("hides EstiloSwitch and ignores ?estilo= in the staff shell", () => {
    mocks.search = new URLSearchParams("estilo=esencial");
    render(<App initial={resolved(null, false)} fixedByOrg />);
    expect(screen.queryByRole("radiogroup", { name: "Estilo" })).toBeNull();
    expect(screen.getByTestId("inicio").textContent).toBe(resolved(null, false).style);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

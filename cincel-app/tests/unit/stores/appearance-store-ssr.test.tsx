// @vitest-environment happy-dom
/**
 * SSR-safe seeding of the `useAppearance` store (#954, zustand.md §2.6): the
 * server HTML of the layout children equals the first client render (no
 * hydration warning), the store is created per request (no value leaks
 * between two renders) and hydrating writes nothing on `<html>`.
 */
import { act } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";
import { AppearanceStoreProvider, useAppearance } from "@/lib/stores/appearance-store";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function resolved(patch: Partial<UserPreferences> = {}): ResolvedAppearance {
  return resolveAppearance(
    { ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 },
    { theme: null, mode: "light", style: null, density: "comoda", textSize: 14, quietHours: null, ...patch },
  );
}

/** Layout children reading the store the way call sites do: whole state and selectors. */
function Page() {
  const { appearance } = useAppearance();
  const density = useAppearance((s) => s.appearance.density);
  const fixed = useAppearance((s) => s.fixedByOrg);
  return (
    <main data-theme-id={appearance.theme} data-density={density}>
      <p>{`${appearance.theme}/${appearance.mode}/${appearance.style}/${density}/${appearance.textSize}/${String(fixed)}`}</p>
    </main>
  );
}

function tree(initial: ResolvedAppearance, fixedByOrg?: boolean) {
  return (
    <AppearanceStoreProvider initial={initial} fixedByOrg={fixedByOrg}>
      <Page />
    </AppearanceStoreProvider>
  );
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("AppearanceStoreProvider SSR", () => {
  it("the first client render equals the server HTML (no hydration warning)", async () => {
    const initial = resolved({ mode: "dark", theme: "grafito", style: "analitico", density: "compacta", textSize: 15.5 });
    const html = renderToString(tree(initial, true));
    expect(html).toContain("grafito/dark/analitico/compacta/15.5/true");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const htmlEl = document.documentElement;
    const attrsBefore = htmlEl.getAttributeNames().map((name) => [name, htmlEl.getAttribute(name)]);
    const classBefore = htmlEl.className;

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recoverable = vi.fn();
    try {
      await act(async () => {
        root = hydrateRoot(container, tree(initial, true), { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
    expect(container.innerHTML).toBe(html);
    // The store writes `<html>` only on client changes.
    expect(htmlEl.getAttributeNames().map((name) => [name, htmlEl.getAttribute(name)])).toEqual(attrsBefore);
    expect(htmlEl.className).toBe(classBefore);
  });

  it("creates the store per request: two server renders never share a value", () => {
    const first = renderToString(tree(resolved({ mode: "dark" })));
    const second = renderToString(tree(resolved({ mode: "light", density: "compacta" })));
    expect(first).toContain("azul/dark/");
    expect(second).toContain("azul/light/");
    expect(second).toContain("/compacta/");
    expect(renderToString(tree(resolved({ mode: "dark" })))).toBe(first);
  });
});

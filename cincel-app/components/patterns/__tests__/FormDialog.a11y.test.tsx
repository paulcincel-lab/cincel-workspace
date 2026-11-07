// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";

import { FormDialog } from "@/components/patterns/FormDialog";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

/** Token pairs the dialog paints: body text, muted description, outline + primary buttons, destructive alert, focus ring. */
const FORM_DIALOG_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "ring/background",
]);

/** Mount one theme the way the app does: a `<style id="appearance">` block plus `data-theme` / `.dark` on `<html>`. */
function applyTheme(theme: ThemeId, mode: Mode) {
  const tokens = THEME_PRESETS[theme].tokens;
  const body = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${body}}`;
  document.head.appendChild(style);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
}

async function seriousViolations() {
  const results = await axe.run(
    {
      include: [document.body],
      // Base UI's focus guards are aria-hidden on purpose: they only bounce Tab back into the trapped dialog.
      exclude: [["[data-base-ui-focus-guard]"]],
    },
    // Color contrast needs real layout/rendering, which happy-dom doesn't provide; the token pairs are checked below.
    { rules: { "color-contrast": { enabled: false } } },
  );
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function Fields() {
  return (
    <div>
      <label htmlFor="tarea-titulo">Título</label>
      <input id="tarea-titulo" name="titulo" defaultValue="Medir cocina" />
      <label htmlFor="tarea-descripcion">Descripción</label>
      <textarea id="tarea-descripcion" name="descripcion" defaultValue="Llevar el flexómetro láser." />
    </div>
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("FormDialog accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      describe(`${theme} · ${mode}`, () => {
        it("has no serious or critical axe violations (with description and error)", async () => {
          applyTheme(theme, mode);
          render(
            <FormDialog
              title="Nueva tarea"
              description="La tarea queda asignada al responsable que elijas."
              open
              onOpenChange={() => undefined}
              onSubmit={async () => undefined}
              submitLabel="Crear tarea"
              error="FORBIDDEN"
            >
              <Fields />
            </FormDialog>,
          );
          await screen.findByRole("dialog", { name: "Nueva tarea" });
          expect(screen.getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción.");
          expect(await seriousViolations()).toEqual([]);
        });

        it("has no serious or critical axe violations when not dismissible and pending (large size)", async () => {
          applyTheme(theme, mode);
          render(
            <FormDialog
              title="Buenos días, Ana"
              description="Registra tu entrada para empezar el día."
              open
              dismissible={false}
              onOpenChange={() => undefined}
              onSubmit={async () => undefined}
              submitLabel="Registrar entrada"
              pending
              size="lg"
            >
              <p>9:02</p>
            </FormDialog>,
          );
          await screen.findByRole("dialog", { name: "Buenos días, Ana" });
          expect(await seriousViolations()).toEqual([]);
        });

        it("the token pairs the dialog uses meet their contrast minimum", () => {
          const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => FORM_DIALOG_PAIRS.has(r.pair));
          const expected = CONTRAST_PAIRS.filter((p) => FORM_DIALOG_PAIRS.has(p.pair)).length;
          expect(results).toHaveLength(expected);
          expect(results.filter((r) => !r.ok)).toEqual([]);
        });
      });
    }
  }
});

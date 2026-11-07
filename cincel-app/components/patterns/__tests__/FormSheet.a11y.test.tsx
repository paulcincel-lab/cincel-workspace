// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";

import { FormSheet } from "@/components/patterns/FormSheet";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

/** Token pairs the sheet paints: body text, muted description, primary submit, destructive alert. */
const FORM_SHEET_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "secondary-foreground/secondary",
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
      // Base UI's focus guards are aria-hidden on purpose: they only bounce Tab back into the trapped sheet.
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
      <label htmlFor="nota-titulo">Título</label>
      <input id="nota-titulo" name="titulo" defaultValue="Compra de herrajes" />
      <label htmlFor="nota-cuerpo">Nota</label>
      <textarea id="nota-cuerpo" name="cuerpo" defaultValue="Revisar medidas con el cliente." />
    </div>
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("FormSheet accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      describe(`${theme} · ${mode}`, () => {
        it("has no serious or critical axe violations (with description and error)", async () => {
          applyTheme(theme, mode);
          render(
            <FormSheet
              title="Editar nota"
              description="Los cambios se guardan para todo el equipo."
              open
              onOpenChange={() => undefined}
              onSubmit={async () => undefined}
              submitLabel="Guardar"
              error="FORBIDDEN"
            >
              <Fields />
            </FormSheet>,
          );
          await screen.findByRole("dialog", { name: "Editar nota" });
          expect(screen.getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción.");
          expect(await seriousViolations()).toEqual([]);
        });

        it("has no serious or critical axe violations while pending (large size)", async () => {
          applyTheme(theme, mode);
          render(
            <FormSheet
              title="Editar tarea"
              open
              onOpenChange={() => undefined}
              onSubmit={async () => undefined}
              submitLabel="Guardar cambios"
              pending
              size="lg"
            >
              <Fields />
            </FormSheet>,
          );
          await screen.findByRole("dialog", { name: "Editar tarea" });
          expect(await seriousViolations()).toEqual([]);
        });

        it("the token pairs the sheet uses meet their contrast minimum", () => {
          const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => FORM_SHEET_PAIRS.has(r.pair));
          const expected = CONTRAST_PAIRS.filter((p) => FORM_SHEET_PAIRS.has(p.pair)).length;
          expect(results).toHaveLength(expected);
          expect(results.filter((r) => !r.ok)).toEqual([]);
        });
      });
    }
  }
});

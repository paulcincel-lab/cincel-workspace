// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { etapaDot } from "@/components/widgets/esencial-tokens";
import { esencialCardsFixture } from "@/components/widgets/fixtures/esencial";
import { STATUS_FIXTURE, ETAPA_FIXTURE } from "@/components/widgets/fixtures/status-adapters";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the rows paint on `card`: titles
 * (`foreground`), meta and muted rows (`muted-foreground`), overdue dates and
 * Bloqueado (`destructive`), text statuses (`warning-ink`, `success`) and the
 * etapa / status dots (`chart-1..3`, 3:1).
 */
const ROW_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "warning-ink/card",
  "success/card",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
]);

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
  document.head.appendChild(style);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-theme-id", theme);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
}

async function seriousViolations() {
  const results = await axe.run(document.body);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderRows() {
  const [polanco, roma] = esencialCardsFixture;
  return render(
    <StyleProvider style="esencial" scope="staff">
      <main>
        <EsencialCard
          title={polanco.title}
          href={polanco.href}
          index={0}
          meta="3 tareas · 1 en retraso"
          completed={{
            count: polanco.completed.length,
            children: polanco.completed.map(({ id, ...row }) => <EsencialItemRow key={id} {...row} />),
          }}
        >
          {polanco.rows.map(({ id, ...row }) => (
            <EsencialItemRow key={id} {...row} />
          ))}
        </EsencialCard>
        <EsencialCard title={roma.title} href={roma.href} padding="lg" index={1}>
          {roma.rows.map(({ id, ...row }) => (
            <EsencialItemRow key={id} {...row} />
          ))}
          <EsencialItemRow
            layout="stacked"
            title="Firmar orden de cambio"
            href="/tareas/t-6"
            meta={[
              { key: "project", label: "Depto Roma Norte", dot: etapaDot(ETAPA_FIXTURE.construccion) },
              { key: "late", label: "12 días tarde", tone: "destructive" },
            ]}
            status={{ kind: "text", label: "Bloqueada", tone: "destructive" }}
          />
          <EsencialItemRow
            title="Elegir muestras de piso"
            onOpen={() => {}}
            leading={<input type="checkbox" aria-label="Completar Elegir muestras de piso" />}
            meta={[{ key: "time", label: "11:00", mono: true }]}
            status={{ kind: "text", label: "jue 12", tone: "warning" }}
          />
          <EsencialItemRow title="Contrato firmado" status={{ kind: "task", value: STATUS_FIXTURE.completado }} muted />
        </EsencialCard>
        <EsencialCard title="Hoy">{null}</EsencialCard>
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("EsencialItemRow a11y", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`${theme} · ${mode}: no serious or critical violations`, async () => {
        applyTheme(theme, mode);
        renderRows();
        expect(await seriousViolations()).toEqual([]);
      });

      it(`${theme} · ${mode}: the token pairs the rows use pass contrast`, () => {
        const used = CONTRAST_PAIRS.filter((p) => ROW_PAIRS.has(p.pair));
        expect(used).toHaveLength(ROW_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => ROW_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});

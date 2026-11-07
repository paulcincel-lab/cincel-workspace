// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

import type { EntityCardGridProps } from "@/components/widgets/EntityCardGrid";

const flags = vi.hoisted(() => ({ createNoteAction: true as boolean }));
const gridCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/actions/my-space-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, {
    get: (_t, key: string) => (key === "createNoteAction" ? flags.createNoteAction : true),
  }),
}));

/** Contract stand-in for the library widget: plain markup from the props it receives. */
vi.mock("@/components/widgets/EntityCardGrid", () => ({
  EntityCardGrid: (props: EntityCardGridProps) => {
    gridCalls.push(props);
    if (props.items.length === 0 && props.emptyState) {
      return (
        <div>
          <p>{props.emptyState.title}</p>
          {props.emptyState.action ? (
            <button type="button" onClick={() => props.emptyState?.action?.onClick?.()}>
              {props.emptyState.action.label}
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <ul>
        {props.items.map((item) => (
          <li key={item.id} data-testid={`card-${item.id}`} data-tint={item.tint} data-icon={item.iconName ?? ""}>
            <a href={item.href}>{item.title}</a>
            <p style={{ whiteSpace: "pre-line" }}>{item.subtitle}</p>
            {item.meta?.map((m) => <span key={m.label}>{m.value}</span>)}
          </li>
        ))}
      </ul>
    );
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { NotesGrid, noteToCard, notesTable } from "@/components/mi-espacio/NotesGrid";
import { NOTE_COLOR_TINT } from "@/lib/my-space/note-ui";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { Note, PresentationStyle } from "@/lib/types/redesign";

const NOW = new Date();
const today = NOW.toISOString();
const older = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();

const NOTES: Note[] = [
  { id: "n1", title: "Ideas cocina", body: "Isla de mármol\nLuz cálida", color: "amber", pinned: false, projectId: null, updatedAt: today },
  { id: "n2", title: "Proveedores", body: "Llamar a Juanma", color: "blue", pinned: true, projectId: null, updatedAt: older },
  { id: "n3", title: "", body: "Solo texto", color: "neutral", pinned: false, projectId: null, updatedAt: older },
  { id: "n4", title: "Paleta", body: "Verde salvia", color: "cyan", pinned: false, projectId: null, updatedAt: older },
  { id: "n5", title: "Recorrido", body: "Lunes 10:00", color: "violet", pinned: true, projectId: null, updatedAt: today },
];

function lastGridProps(): EntityCardGridProps {
  return gridCalls[gridCalls.length - 1] as EntityCardGridProps;
}

function renderGrid(style: PresentationStyle = "visual", props: Partial<Parameters<typeof NotesGrid>[0]> = {}) {
  const onOpen = vi.fn();
  const onNew = vi.fn();
  render(
    <StyleProvider style={style} scope="staff">
      <NotesGrid notes={NOTES} onOpen={onOpen} onNew={onNew} {...props} />
    </StyleProvider>,
  );
  return { onOpen, onNew };
}

afterEach(() => {
  cleanup();
  gridCalls.length = 0;
  flags.createNoteAction = true;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("NotesGrid", () => {
  it("is an EntityCardGrid with minmax(220px) cards and the notes index table", () => {
    renderGrid();
    const props = lastGridProps();
    expect(props.minWidth).toBe(220);
    expect(props.table?.columns.map((c) => c.label)).toEqual(["Título", "Color", "Fijada", "Editada"]);
    expect(props.table?.rows[0]).toMatchObject({ titulo: "Recorrido", color: "Violeta", fijada: "Sí" });
  });

  it("tints each card by its color through tokens only", () => {
    renderGrid();
    for (const note of NOTES) {
      expect(screen.getByTestId(`card-${note.id}`).getAttribute("data-tint")).toBe(NOTE_COLOR_TINT[note.color]);
    }
    expect(noteToCard(NOTES[0], NOW).tint).toBe("chart-3");
    expect(noteToCard(NOTES[2], NOW).tint).toBe("muted");
    for (const tint of Object.values(NOTE_COLOR_TINT)) expect(tint).toMatch(/^(muted|chart-[1-5])$/);
  });

  it("puts pinned notes first with the pin icon, then by last edit", () => {
    renderGrid();
    expect(lastGridProps().items.map((i) => i.id)).toEqual(["n5", "n2", "n1", "n3", "n4"]);
    expect(screen.getByTestId("card-n5").getAttribute("data-icon")).toBe("pin");
    expect(screen.getByTestId("card-n2").getAttribute("data-icon")).toBe("pin");
    expect(screen.getByTestId("card-n1").getAttribute("data-icon")).toBe("");
  });

  it("keeps line breaks in the body and shows the edit meta", () => {
    renderGrid();
    expect(lastGridProps().items.find((i) => i.id === "n1")?.subtitle).toBe("Isla de mármol\nLuz cálida");
    expect(screen.getAllByText("editada hoy").length).toBe(2);
    expect(noteToCard(NOTES[2], NOW).title).toBe("Sin título");
  });

  it("opens a note in place on click", () => {
    const { onOpen } = renderGrid();
    fireEvent.click(screen.getByRole("link", { name: "Proveedores" }));
    expect(onOpen).toHaveBeenCalledWith(NOTES[1]);
    expect(screen.getByRole("link", { name: "Proveedores" }).getAttribute("href")).toBe("/mi-espacio?nota=n2");
  });

  it("shows Nueva nota (primary) and calls onNew", () => {
    const { onNew } = renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Nueva nota" }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state with a button that opens the editor", () => {
    const { onNew } = renderGrid("visual", { notes: [] });
    expect(screen.getByText("Escribe tu primera nota")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Nueva nota" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Nueva nota" }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("hides every create entry point while createNoteAction is a stub", () => {
    flags.createNoteAction = false;
    renderGrid("visual", { notes: [] });
    expect(screen.getByText("Escribe tu primera nota")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nueva nota" })).toBeNull();
    cleanup();
    renderGrid();
    expect(screen.queryByRole("button", { name: "Nueva nota" })).toBeNull();
  });

  it("passes the same data in Visual, Esencial and Analítico (the widget picks the style)", () => {
    const seen = (["visual", "esencial", "analitico"] as const).map((style) => {
      renderGrid(style);
      const { items, table, minWidth } = lastGridProps();
      cleanup();
      return JSON.stringify({ items, table, minWidth });
    });
    expect(new Set(seen).size).toBe(1);
    expect(notesTable(NOTES).rows).toHaveLength(NOTES.length);
  });

  it("does not branch on style or import StyleView (FE §18 item 15)", () => {
    const src = readFileSync(join(__dirname, "NotesGrid.tsx"), "utf8");
    expect(src).not.toMatch(/StyleView|useStyle|esencial|analitico/);
  });

  it("note tint text passes checkContrast in every theme, light and dark", () => {
    const tintPairs = new Set(
      CONTRAST_PAIRS.filter((p) => /^chart-[1-4]-ink$/.test(p.fg) && /^chart-[1-4]-tint$/.test(p.bg)).map((p) => p.pair),
    );
    expect(tintPairs.size).toBe(4);
    for (const theme of THEME_IDS) {
      const tokens = THEME_PRESETS[theme].tokens;
      for (const mode of ["light", "dark"] as const) {
        const results = checkContrast(tokens, mode).filter((r) => tintPairs.has(r.pair));
        expect(results).toHaveLength(4);
        for (const r of results) expect(r, `${theme} ${mode} ${r.pair}`).toMatchObject({ ok: true });
        // Neutral notes sit on `muted`: evaluate foreground on it through the same checker.
        const onMuted = checkContrast({ ...tokens, card: tokens.muted }, mode).find((r) => r.pair === "foreground/card");
        expect(onMuted?.ok, `${theme} ${mode} foreground/muted`).toBe(true);
      }
    }
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in all three themes, light and dark", { timeout: 120_000 }, async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        const root = document.documentElement;
        root.setAttribute("data-theme", mode);
        for (const [name, value] of Object.entries(THEME_PRESETS[theme].tokens)) {
          root.style.setProperty(`--${name}`, value[mode]);
        }
        renderGrid();
        const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => v.id), `${theme} ${mode}`).toEqual([]);
        cleanup();
      }
    }
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { statusTone, tramoDot } from "@/components/widgets/esencial-tokens";
import { STATUS_FIXTURE, TRAMO_FIXTURE } from "@/components/widgets/fixtures/status-adapters";

afterEach(cleanup);

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

function rowOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="esencial-row"]') as HTMLElement;
}

describe("EsencialItemRow", () => {
  it("renders status last for task status", () => {
    const { container } = render(
      <EsencialItemRow
        title="Revisión de planos eléctricos con Ana"
        href="/tareas/t-1"
        meta={[
          { key: "tramo", label: "Diseño", dot: "var(--chart-2)" },
          { key: "date", label: "5 nov", mono: true, tone: "destructive" },
        ]}
        status={{ kind: "task", value: STATUS_FIXTURE.enProceso }}
      />,
    );
    const row = rowOf(container);
    const last = row.lastElementChild as HTMLElement;
    expect(last.getAttribute("data-slot")).toBe("esencial-status");
    expect(last.className).toContain("min-w-[104px]");
    expect(last.className).toContain("justify-end");
    expect(last.className).toContain("whitespace-nowrap");
    const chip = last.querySelector('[data-slot="status-chip"]') as HTMLElement;
    expect(chip.getAttribute("data-variant")).toBe("dot");
    expect(chip.textContent).toBe("En proceso");
    expect(chip.getAttribute("style")).toContain("var(--chart-2-ink)");
    const children = Array.from(row.children).map((el) => el.getAttribute("data-slot"));
    expect(children.slice(-3)).toEqual(["esencial-meta", "esencial-meta", "esencial-status"]);
  });

  it("text status with tone", () => {
    const tones = [
      ["destructive", "text-destructive"],
      ["warning", "text-warning-ink"],
      ["success", "text-success"],
      ["muted", "text-muted-foreground"],
      ["default", "text-foreground"],
    ] as const;
    for (const [tone, cls] of tones) {
      const { container, unmount } = render(
        <EsencialItemRow title="Planos" status={{ kind: "text", label: "12 d tarde", tone }} />,
      );
      const label = container.querySelector('[data-slot="esencial-status"] > span') as HTMLElement;
      expect(label.textContent).toBe("12 d tarde");
      expect(label.classList.contains(cls)).toBe(true);
      unmount();
    }
    const { container } = render(<EsencialItemRow title="Planos" status={{ kind: "text", label: "jue 12" }} />);
    expect(container.querySelector('[data-slot="esencial-status"] > span')!.classList.contains("text-foreground")).toBe(true);
  });

  it("null status keeps the column", () => {
    const { container } = render(<EsencialItemRow title="Revisar planos" status={null} />);
    const col = container.querySelector('[data-slot="esencial-status"]') as HTMLElement;
    expect(col).not.toBeNull();
    expect(col.className).toContain("min-w-[104px]");
    expect(col.textContent).toBe("");
  });

  it("meta dot, mono and destructive tone", () => {
    const dot = tramoDot(TRAMO_FIXTURE.diseno);
    const { container } = render(
      <EsencialItemRow
        title="Validar plano"
        status={null}
        meta={[
          { key: "tramo", label: "Diseño", dot },
          { key: "date", label: "6 nov", mono: true, tone: "destructive" },
          { key: "time", label: "11:00", mono: true },
        ]}
      />,
    );
    const [tramo, date, time] = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="esencial-meta"]'));
    expect(tramo.className).toContain("text-xs");
    expect(tramo.className).toContain("text-muted-foreground");
    expect(tramo.className).toContain("gap-[5px]");
    const dotEl = tramo.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(dotEl.className).toContain("size-[7px]");
    expect(dotEl.getAttribute("style")).toContain(dot);
    expect(date.className).toContain("font-mono");
    expect(date.className).toContain("text-destructive");
    expect(date.className).not.toContain("text-muted-foreground");
    expect(time.className).toContain("font-mono");
    expect(time.className).toContain("text-muted-foreground");
    expect(time.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("stacked layout", () => {
    const { container } = render(
      <EsencialItemRow
        layout="stacked"
        title="Firmar orden de cambio"
        href="/tareas/t-6"
        meta={[
          { key: "project", label: "Depto Roma Norte", dot: "var(--chart-3)" },
          { key: "late", label: "12 días tarde", tone: "destructive" },
        ]}
        status={{ kind: "text", label: "Bloqueada", tone: "destructive" }}
      />,
    );
    const row = rowOf(container);
    expect(row.getAttribute("data-layout")).toBe("stacked");
    expect(row.className).toContain("p-3");
    const line2 = row.querySelector("p") as HTMLElement;
    expect(line2.className).toContain("text-[12.5px]");
    expect(line2.textContent).toBe("Depto Roma Norte · 12 días tarde");
    const dots = line2.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(1);
    expect(line2.firstElementChild).toBe(dots[0]);
    expect(line2.querySelector(".text-destructive")!.textContent).toBe("12 días tarde");
    expect((row.lastElementChild as HTMLElement).getAttribute("data-slot")).toBe("esencial-status");
  });

  it("one tab stop and opens on row click", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <EsencialItemRow
        title="Visita de obra semanal"
        onOpen={onOpen}
        meta={[{ key: "date", label: "13 nov", mono: true }]}
        status={{ kind: "task", value: STATUS_FIXTURE.pendiente }}
      />,
    );
    const row = rowOf(container);
    const focusables = row.querySelectorAll(FOCUSABLE);
    expect(focusables).toHaveLength(1);
    const opener = screen.getByRole("button", { name: "Visita de obra semanal" });
    expect(focusables[0]).toBe(opener);
    // The stretched pseudo-element covers the row, anchored to the relative row.
    expect(row.className).toContain("relative");
    expect(opener.className).toContain("after:absolute");
    expect(opener.className).toContain("after:inset-0");
    expect(row.className).toContain("has-[:focus-visible]:ring-2");
    fireEvent.click(opener);
    expect(onOpen).toHaveBeenCalledTimes(1);

    cleanup();
    const linked = render(<EsencialItemRow title="Aprobar cotización" href="/tareas/t-2" status={null} />);
    const link = screen.getByRole("link", { name: "Aprobar cotización" });
    expect(link.getAttribute("href")).toBe("/tareas/t-2");
    expect(rowOf(linked.container).querySelectorAll(FOCUSABLE)).toHaveLength(1);
  });

  it("truncates long titles with the full title available", () => {
    const title = "Revisión estructural de cimentación con el ingeniero y el cliente en sitio";
    render(<EsencialItemRow title={title} href="/tareas/t-9" status={null} />);
    const link = screen.getByRole("link", { name: title });
    expect(link.getAttribute("title")).toBe(title);
    expect(link.className).toContain("truncate");
    expect(link.className).toContain("min-w-0");
  });

  it("leading control stays focusable", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <EsencialItemRow
        title="Revisar presupuesto"
        href="/tareas/t-7"
        status={null}
        leading={<input type="checkbox" aria-label="Completar Revisar presupuesto" onChange={onToggle} />}
      />,
    );
    const row = rowOf(container);
    const focusables = Array.from(row.querySelectorAll(FOCUSABLE));
    expect(focusables).toHaveLength(2);
    const checkbox = screen.getByRole("checkbox", { name: "Completar Revisar presupuesto" });
    expect(focusables[0]).toBe(checkbox);
    const slot = row.querySelector('[data-slot="esencial-leading"]') as HTMLElement;
    expect(slot.className).toContain("relative");
    expect(slot.className).toContain("z-10");
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("isNew adds row-new", () => {
    const { container, unmount } = render(<EsencialItemRow title="Nueva" status={null} isNew />);
    expect(rowOf(container).className).toContain("row-new");
    unmount();
    const plain = render(<EsencialItemRow title="Vieja" status={null} />);
    expect(rowOf(plain.container).className).not.toContain("row-new");
  });

  it("muted title", () => {
    render(<EsencialItemRow title="Levantamiento" href="/tareas/t-4" status={null} muted />);
    const link = screen.getByRole("link", { name: "Levantamiento" });
    expect(link.className).toContain("text-muted-foreground");
    expect(link.classList.contains("text-foreground")).toBe(false);
    cleanup();
    render(<EsencialItemRow title="Activa" href="/tareas/t-5" status={null} />);
    expect(screen.getByRole("link", { name: "Activa" }).classList.contains("text-foreground")).toBe(true);
  });
});

describe("esencial-tokens", () => {
  it("statusTone pairs the chart dot with its ink; Bloqueado is destructive", () => {
    expect(statusTone(STATUS_FIXTURE.pendiente)).toEqual({ dot: "var(--chart-3)", ink: "var(--chart-3-ink)" });
    expect(statusTone(STATUS_FIXTURE.enProceso)).toEqual({ dot: "var(--chart-2)", ink: "var(--chart-2-ink)" });
    expect(statusTone(STATUS_FIXTURE.entregado)).toEqual({ dot: "var(--chart-1)", ink: "var(--chart-1-ink)" });
    expect(statusTone(STATUS_FIXTURE.bloqueado)).toEqual({ dot: "var(--destructive)", ink: "var(--destructive)" });
  });

  it("tramoDot uses the tramo color and a neutral color without tramo", () => {
    expect(tramoDot(TRAMO_FIXTURE.presale)).toBe("var(--chart-1)");
    expect(tramoDot(TRAMO_FIXTURE.diseno)).toBe("var(--chart-2)");
    expect(tramoDot(null)).toBe("var(--muted-foreground)");
  });
});

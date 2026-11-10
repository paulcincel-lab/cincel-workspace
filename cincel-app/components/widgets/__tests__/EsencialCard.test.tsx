// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { ESENCIAL_CARD_EMPTY_TEXT, EsencialCard, completedLabel } from "@/components/widgets/EsencialCard";
import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { esencialCardsFixture } from "@/components/widgets/fixtures/esencial";

afterEach(cleanup);

const [polanco] = esencialCardsFixture;

function PolancoCard({ index }: { index?: number }) {
  return (
    <EsencialCard
      title={polanco.title}
      href={polanco.href}
      index={index}
      meta={
        <>
          {polanco.taskCount} tareas · <span className="text-destructive">{polanco.overdueCount} en retraso</span>
        </>
      }
      action={<Badge variant="destructive">7 vencidas</Badge>}
      completed={{
        count: polanco.completed.length,
        children: polanco.completed.map(({ id, ...row }) => <EsencialItemRow key={id} {...row} />),
      }}
    >
      {polanco.rows.map(({ id, ...row }) => (
        <EsencialItemRow key={id} {...row} />
      ))}
    </EsencialCard>
  );
}

describe("EsencialCard", () => {
  it("renders title link, meta and action", () => {
    const { container } = render(<PolancoCard />);
    const section = container.querySelector("section")!;
    const heading = screen.getByRole("heading", { level: 2, name: "Oficina Polanco" });
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    const link = screen.getByRole("link", { name: "Oficina Polanco" });
    expect(link.getAttribute("href")).toBe("/proyectos/p-polanco");
    expect(link.className).toContain("hover:text-primary");
    const meta = container.querySelector('[data-slot="esencial-card-meta"]')!;
    expect(meta.textContent).toBe("3 tareas · 1 en retraso");
    expect(meta.className).toContain("text-muted-foreground");
    expect(meta.querySelector(".text-destructive")!.textContent).toBe("1 en retraso");
    expect(screen.getByText("7 vencidas")).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="esencial-row"]')).toHaveLength(3);
  });

  it("renders the title as text without href, at heading level 3 and with a link action", () => {
    render(
      <EsencialCard
        title="Hoy"
        headingLevel={3}
        meta="al día"
        action={
          <Button variant="link" size="sm">
            Ver todas →
          </Button>
        }
      >
        <EsencialItemRow title="Revisar planos" status={null} />
      </EsencialCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Hoy" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Hoy" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver todas →" })).toBeTruthy();
  });

  it("padding md and lg", () => {
    const md = render(<EsencialCard title="A">{null}</EsencialCard>);
    const mdSection = md.container.querySelector("section")!;
    expect(mdSection.getAttribute("data-padding")).toBe("md");
    expect(mdSection.className).toContain("pt-[18px]");
    expect(mdSection.className).toContain("px-5");
    expect(mdSection.className).toContain("pb-3.5");
    md.unmount();
    const lg = render(
      <EsencialCard title="B" padding="lg">
        {null}
      </EsencialCard>,
    );
    const lgSection = lg.container.querySelector("section")!;
    expect(lgSection.className).toContain("py-[22px]");
    expect(lgSection.className).toContain("px-6");
    expect(lgSection.className).toContain("gap-3.5");
  });

  it("completed disclosure toggles aria-expanded and shows rows", () => {
    render(<PolancoCard />);
    const toggle = screen.getByRole("button", { name: "1 completada" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region).not.toBeNull();
    expect(region.hasAttribute("hidden")).toBe(true);
    expect(toggle.querySelector("svg.chev")).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(region.hasAttribute("hidden")).toBe(false);
    const completedRow = region.querySelector('[data-slot="esencial-row"]')!;
    expect(completedRow.textContent).toContain("Levantamiento del sitio");
    expect(completedRow.hasAttribute("data-muted")).toBe(true);
    expect(screen.getByRole("link", { name: "Levantamiento del sitio" }).className).toContain("text-muted-foreground");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(region.hasAttribute("hidden")).toBe(true);
  });

  it("pluralizes completada / completadas", () => {
    expect(completedLabel(1)).toBe("1 completada");
    expect(completedLabel(2)).toBe("2 completadas");
    expect(completedLabel(12)).toBe("12 completadas");
    render(
      <EsencialCard title="A" completed={{ count: 3, children: null }}>
        {null}
      </EsencialCard>,
    );
    expect(screen.getByRole("button", { name: "3 completadas" })).toBeTruthy();
  });

  it("hides the disclosure when nothing is completed", () => {
    render(
      <EsencialCard title="A" completed={{ count: 0, children: null }}>
        {null}
      </EsencialCard>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("applies the stagger delay from index", () => {
    const delays = [0, 1, 2, 3].map((i) => {
      const { container, unmount } = render(<PolancoCard index={i} />);
      const section = container.querySelector("section")!;
      expect(section.className).toContain("anim-in");
      const delay = section.style.getPropertyValue("--anim-delay");
      unmount();
      return delay;
    });
    expect(delays).toEqual(["0ms", "40ms", "80ms", "120ms"]);

    const { container } = render(<PolancoCard />);
    const section = container.querySelector("section")!;
    expect(section.className).not.toContain("anim-in");
    expect(section.style.getPropertyValue("--anim-delay")).toBe("");
  });

  it("renders the empty line without children", () => {
    const { container } = render(<EsencialCard title="Hoy">{null}</EsencialCard>);
    expect(screen.getByText(ESENCIAL_CARD_EMPTY_TEXT)).toBeTruthy();
    expect(ESENCIAL_CARD_EMPTY_TEXT).toBe("Nada pendiente aquí.");
    expect(container.querySelector('[data-slot="esencial-card-body"]')).toBeNull();

    cleanup();
    render(
      <EsencialCard title="Hoy">
        <p>Sin tareas para hoy.</p>
      </EsencialCard>,
    );
    expect(screen.queryByText(ESENCIAL_CARD_EMPTY_TEXT)).toBeNull();
    expect(screen.getByText("Sin tareas para hoy.")).toBeTruthy();
  });

  it("bleeds the rows 10 px past the text", () => {
    const { container } = render(<PolancoCard />);
    expect(container.querySelector('[data-slot="esencial-card-body"]')!.className).toContain("-mx-2.5");
  });

  it("reproduces the Lista-Esencial cards from the fixture", () => {
    const { container } = render(
      <>
        {esencialCardsFixture.map((card, i) => (
          <EsencialCard
            key={card.id}
            title={card.title}
            href={card.href}
            index={i}
            meta={`${card.taskCount} tareas · ${card.overdueCount > 0 ? `${card.overdueCount} en retraso` : "al día"}`}
            completed={
              card.completed.length > 0
                ? {
                    count: card.completed.length,
                    children: card.completed.map(({ id, ...row }) => <EsencialItemRow key={id} {...row} />),
                  }
                : undefined
            }
          >
            {card.rows.map(({ id, ...row }) => (
              <EsencialItemRow key={id} {...row} />
            ))}
          </EsencialCard>
        ))}
      </>,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Oficina Polanco",
      "Depto Roma Norte",
      "Casa Madrid 22",
      "Casa Valle de Bravo",
    ]);
    expect(screen.getAllByRole("button", { name: "1 completada" })).toHaveLength(2);
    expect(screen.getByText("3 tareas · al día")).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="esencial-card-body"] [data-slot="esencial-row"]')).toHaveLength(10);
  });
});

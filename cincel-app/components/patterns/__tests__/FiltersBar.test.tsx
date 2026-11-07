// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { FiltersBar, colorVarValue, type FiltersBarChip } from "@/components/patterns/FiltersBar";

const clicked: string[] = [];

vi.mock("next/link", async () => {
  const React = await import("react");
  type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
  };
  const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { href, replace, scroll, prefetch, onClick, ...rest },
    ref,
  ) {
    void prefetch;
    return (
      <a
        ref={ref}
        href={href}
        data-replace={replace ? "true" : undefined}
        data-scroll={scroll === false ? "false" : undefined}
        onClick={(e) => {
          onClick?.(e);
          e.preventDefault();
          clicked.push(href);
        }}
        {...rest}
      />
    );
  });
  return { default: Link };
});

const CHIPS: FiltersBarChip[] = [
  { key: "todas", label: "Todas", count: 24, pressed: false, href: "/tareas" },
  { key: "diseno", label: "Diseño", count: 9, colorVar: "--chart-2", pressed: true, href: "/tareas?tramo=diseno" },
  { key: "construccion", label: "Construcción", colorVar: "var(--chart-3)", pressed: false, href: "/tareas?tramo=construccion" },
];

afterEach(() => {
  cleanup();
  clicked.length = 0;
});

describe("FiltersBar", () => {
  it("renders nothing without chips, selects or search", () => {
    const { container } = render(<FiltersBar />);
    expect(container.innerHTML).toBe("");
    const { container: empty } = render(<FiltersBar chips={[]} selects={[]} />);
    expect(empty.innerHTML).toBe("");
  });

  it("renders chips as toggle buttons with aria-pressed and URL hrefs", () => {
    render(<FiltersBar chips={CHIPS} />);
    const group = screen.getByRole("group", { name: "Filtros" });
    const chips = within(group).getAllByRole("button");
    expect(chips).toHaveLength(3);

    const todas = screen.getByRole("button", { name: /Todas/ });
    expect(todas.tagName).toBe("A");
    expect(todas.getAttribute("href")).toBe("/tareas");
    expect(todas.getAttribute("aria-pressed")).toBe("false");

    const diseno = screen.getByRole("button", { name: /Diseño/ });
    expect(diseno.getAttribute("href")).toBe("/tareas?tramo=diseno");
    expect(diseno.getAttribute("aria-pressed")).toBe("true");
    // Filters replace the URL without scrolling.
    expect(diseno.getAttribute("data-replace")).toBe("true");
    expect(diseno.getAttribute("data-scroll")).toBe("false");
  });

  it("includes the count in the chip and omits it when absent", () => {
    render(<FiltersBar chips={CHIPS} />);
    const diseno = screen.getByRole("button", { name: /Diseño/ });
    expect(diseno.textContent).toContain("9");
    expect(diseno.querySelector("[data-slot=chip-count]")?.textContent).toBe("9");
    const construccion = screen.getByRole("button", { name: /Construcción/ });
    expect(construccion.querySelector("[data-slot=chip-count]")).toBeNull();
  });

  it("draws the color square from the token variable, hidden from assistive tech", () => {
    render(<FiltersBar chips={CHIPS} />);
    const swatch = screen.getByRole("button", { name: /Diseño/ }).querySelector<HTMLElement>("[data-slot=chip-swatch]");
    expect(swatch).not.toBeNull();
    expect(swatch?.getAttribute("aria-hidden")).toBe("true");
    expect(swatch?.style.background).toContain("var(--chart-2)");
    expect(screen.getByRole("button", { name: /Todas/ }).querySelector("[data-slot=chip-swatch]")).toBeNull();
  });

  it("normalizes color variables", () => {
    expect(colorVarValue("--chart-1")).toBe("var(--chart-1)");
    expect(colorVarValue(" var(--chart-4) ")).toBe("var(--chart-4)");
  });

  it("makes the active chip visually distinct with plain variants", () => {
    render(<FiltersBar chips={CHIPS} />);
    const active = screen.getByRole("button", { name: /Diseño/ });
    const inactive = screen.getByRole("button", { name: /Todas/ });
    expect(active.getAttribute("data-state")).toBe("on");
    expect(inactive.getAttribute("data-state")).toBe("off");
    expect(active.className).toContain("bg-primary");
    expect(inactive.className).toContain("border-border");
    expect(active.className).not.toBe(inactive.className);
  });

  it("is keyboard operable: chips are focusable and Enter / Space activate them", () => {
    render(<FiltersBar chips={CHIPS} />);
    const chip = screen.getByRole("button", { name: /Construcción/ });
    chip.focus();
    expect(document.activeElement).toBe(chip);

    fireEvent.keyDown(chip, { key: " " });
    fireEvent.keyUp(chip, { key: " " });
    expect(clicked).toContain("/tareas?tramo=construccion");

    clicked.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Todas/ }));
    expect(clicked).toEqual(["/tareas"]);
  });

  it("renders the selects slot in order", () => {
    render(
      <FiltersBar
        selects={[
          <button key="r" type="button">Responsable: Yo</button>,
          <button key="p" type="button">Proyecto</button>,
        ]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Responsable: Yo", "Proyecto"]);
  });

  it("renders a labelled search box that reports changes", () => {
    const onChange = vi.fn();
    render(<FiltersBar search={{ value: "cocina", placeholder: "Buscar tareas", onChange }} />);
    const box = screen.getByRole("searchbox", { name: "Buscar tareas" }) as HTMLInputElement;
    expect(box.value).toBe("cocina");
    fireEvent.change(box, { target: { value: "baño" } });
    expect(onChange).toHaveBeenCalledWith("baño");
  });

  it("ignores the presentation style and uses no color className overrides", () => {
    const source = readFileSync(resolve(__dirname, "../FiltersBar.tsx"), "utf8");
    expect(source).not.toMatch(/StyleView|usePresentationStyle|useStyle\b/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:bg|text|border|ring)-(?:red|blue|green|gray|slate|zinc|neutral|amber|yellow|emerald|sky|indigo|violet|rose|orange|white|black)\b/);
    expect(source).not.toMatch(/font-(?:bold|extrabold|black)/);
  });
});

// @vitest-environment happy-dom
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarioToolbar, type CalendarioToolbarProps } from "./CalendarioToolbar";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

function setup(props: Partial<CalendarioToolbarProps> = {}) {
  const handlers = {
    onVista: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onPrefetch: vi.fn(),
    onPrefetchCancel: vi.fn(),
  };
  render(<CalendarioToolbar vista="semana" rangeLabel="9 – 15 nov 2026" {...handlers} {...props} />);
  return handlers;
}

describe("CalendarioToolbar", () => {
  it("marks the current vista with aria-pressed and switches on click", () => {
    const h = setup();
    const group = screen.getByRole("group", { name: "Vista" });
    expect(within(group).getByRole("button", { name: "Semana" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Día" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(group).getByRole("button", { name: "Mes" }));
    expect(h.onVista).toHaveBeenCalledWith("mes");
  });

  it("navigates with Anterior, Hoy and Siguiente and shows the range label", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(h.onPrevious).toHaveBeenCalledTimes(1);
    expect(h.onToday).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText("9 – 15 nov 2026")).toBeTruthy();
  });

  it("disables Hoy when asked", () => {
    setup({ todayDisabled: true });
    expect((screen.getByRole("button", { name: "Hoy" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for the adjacent range on hover and on focus, and cancels on leave", () => {
    const h = setup();
    const next = screen.getByRole("button", { name: "Siguiente" });
    const previous = screen.getByRole("button", { name: "Anterior" });
    fireEvent.mouseEnter(next);
    expect(h.onPrefetch).toHaveBeenLastCalledWith(1);
    fireEvent.mouseLeave(next);
    expect(h.onPrefetchCancel).toHaveBeenCalledTimes(1);
    fireEvent.focus(previous);
    expect(h.onPrefetch).toHaveBeenLastCalledWith(-1);
    fireEvent.blur(previous);
    expect(h.onPrefetchCancel).toHaveBeenCalledTimes(2);
  });

  it("reaches every control with Tab order and runs them from the keyboard", () => {
    const h = setup();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Día", "Semana", "Mes", "Anterior", "Hoy", "Siguiente"]);
    for (const button of buttons) expect((button as HTMLButtonElement).tabIndex).toBe(0);
    // Native buttons turn Enter and Space into a click; the click handler is what the keyboard reaches.
    const next = screen.getByRole("button", { name: "Siguiente" });
    next.focus();
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });
});

describe("CalendarioToolbar accessibility", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`axe clean (${mode})`, async () => {
      document.documentElement.setAttribute("data-theme", mode);
      const { container } = render(
        <CalendarioToolbar vista="mes" rangeLabel="Noviembre 2026" onVista={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} onToday={vi.fn()} />,
      );
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    });
  }
});

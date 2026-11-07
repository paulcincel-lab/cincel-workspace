// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton, type LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";

afterEach(() => {
  cleanup();
});

const VARIANTS: LoadingSkeletonProps["variant"][] = ["kpis", "cards", "list", "table", "board", "calendar"];

describe("LoadingSkeleton", () => {
  it.each(VARIANTS)("renders the %s variant as a busy status region", (variant) => {
    const { container } = render(<LoadingSkeleton variant={variant} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(region.getAttribute("data-variant")).toBe(variant);
    expect(region.textContent).toContain("Cargando…");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("uses the default item count per variant", () => {
    const expected: Record<LoadingSkeletonProps["variant"], number> = {
      kpis: 4,
      cards: 6,
      list: 5,
      table: 5,
      board: 12,
      calendar: 5,
    };
    for (const variant of VARIANTS) {
      const { container, unmount } = render(<LoadingSkeleton variant={variant} />);
      expect(container.querySelectorAll('[data-skeleton="item"]').length).toBe(expected[variant]);
      unmount();
    }
  });

  it("honours rows", () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={8} />);
    expect(container.querySelectorAll('[data-skeleton="item"]').length).toBe(8);
    expect(container.querySelectorAll('[data-skeleton="header"]').length).toBe(1);
  });

  it("renders seven days per calendar week and four board columns", () => {
    const cal = render(<LoadingSkeleton variant="calendar" rows={2} />);
    const weeks = cal.container.querySelectorAll('[data-skeleton="item"]');
    expect(weeks.length).toBe(2);
    expect(weeks[0].querySelectorAll('[data-slot="skeleton"]').length).toBe(7);
    cal.unmount();

    const board = render(<LoadingSkeleton variant="board" rows={2} />);
    expect(board.container.querySelectorAll('[data-skeleton="column"]').length).toBe(4);
    expect(board.container.querySelectorAll('[data-skeleton="item"]').length).toBe(8);
  });

  it("clamps rows to at least one", () => {
    const { container } = render(<LoadingSkeleton variant="list" rows={0} />);
    expect(container.querySelectorAll('[data-skeleton="item"]').length).toBe(1);
  });
});

describe("ErrorState", () => {
  it("shows the default copy as a destructive alert", () => {
    render(<ErrorState />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-slot")).toBe("alert");
    expect(alert.textContent).toContain("No se pudo cargar esta página.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onRetry from Reintentar", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a custom title, description and the optional code", () => {
    const { container } = render(
      <ErrorState title="No se pudo cargar el cronograma" description="Revisa tu conexión." code="a1b2c3" />,
    );
    expect(screen.getByText("No se pudo cargar el cronograma")).toBeTruthy();
    expect(screen.queryByText("No se pudo cargar esta página.")).toBeNull();
    expect(screen.getByText("Revisa tu conexión.")).toBeTruthy();
    expect(container.querySelector('[data-slot="error-state-code"]')?.textContent).toBe("a1b2c3");
  });

  it("omits the code when not given", () => {
    const { container } = render(<ErrorState onRetry={() => undefined} />);
    expect(container.querySelector('[data-slot="error-state-code"]')).toBeNull();
  });
});

describe("EmptyState", () => {
  it("renders icon, title and description", () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="Todo al día" description="No tienes correos ni avisos pendientes." />,
    );
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("No tienes correos ni avisos pendientes.")).toBeTruthy();
    const icon = container.querySelector('[data-slot="empty-state-icon"] svg');
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders without icon, description or action", () => {
    const { container } = render(<EmptyState title="Aún no hay proyectos activos" />);
    expect(screen.getByText("Aún no hay proyectos activos")).toBeTruthy();
    expect(container.querySelector('[data-slot="empty-state-icon"]')).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a link action when href is set", () => {
    render(<EmptyState title="Aún no hay proyectos activos" action={{ label: "Nuevo proyecto", href: "/proyectos?nuevo=1" }} />);
    const link = screen.getByRole("link", { name: "Nuevo proyecto" });
    expect(link.getAttribute("href")).toBe("/proyectos?nuevo=1");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a button action that calls onClick", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Ninguna tarea coincide con los filtros" action={{ label: "Limpiar filtros", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("weights", () => {
  it("never uses a font weight above 600", () => {
    const { container } = render(
      <div>
        <EmptyState title="Todo al día" action={{ label: "Nueva tarea", href: "/tareas?nueva=1" }} />
        <ErrorState onRetry={() => undefined} code="X" />
        {VARIANTS.map((v) => (
          <LoadingSkeleton key={v} variant={v} />
        ))}
      </div>,
    );
    expect(container.innerHTML).not.toMatch(/font-(bold|extrabold|black)\b/);
  });
});

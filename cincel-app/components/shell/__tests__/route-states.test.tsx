// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/proyectos" }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

// The shared states are their own issue's contract; these doubles record what
// the route boundaries pass to them.
vi.mock("@/components/shell/ErrorState", () => ({
  ErrorState: (props: { title?: string; onRetry?(): void; code?: string }) => (
    <div data-testid="error-state" data-code={props.code ?? ""}>
      <p>{props.title}</p>
      {props.onRetry ? (
        <button type="button" onClick={() => props.onRetry?.()}>
          Reintentar
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: ({ variant }: { variant: string }) => <div data-testid="skeleton" data-variant={variant} />,
}));

import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { RouteError } from "@/components/shell/RouteError";
import { RouteLoading } from "@/components/shell/RouteLoading";

beforeEach(() => {
  nav.pathname = "/proyectos";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("renders ErrorState with the route copy and 'Reintentar' calling reset", () => {
    const reset = vi.fn();
    render(<RouteError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={reset} />);
    const state = screen.getByTestId("error-state");
    expect(state.textContent).toContain("No se pudo cargar esta página.");
    expect(state.getAttribute("data-code")).toBe("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("prefers unstable_retry over reset when the boundary provides it", () => {
    const reset = vi.fn();
    const retry = vi.fn();
    render(<RouteError error={new Error("boom")} reset={reset} unstable_retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("logs the error once", () => {
    const error = new Error("boom");
    render(<RouteError error={error} reset={() => {}} />);
    expect(console.error).toHaveBeenCalledWith("[route-error]", error);
  });

  it("renders the permission-denied state for FORBIDDEN", () => {
    render(<RouteError error={new Error("FORBIDDEN: projects.canViewProjects")} reset={() => {}} />);
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No tienes permiso para ver esta página.");
  });
});

describe("RouteLoading", () => {
  it.each([
    ["/inicio", "kpis"],
    ["/proyectos", "cards"],
    ["/tareas", "list"],
    ["/personas/clientes", "table"],
  ])("renders the %s skeleton as %s", (pathname, variant) => {
    nav.pathname = pathname;
    render(<RouteLoading />);
    expect(screen.getByTestId("skeleton").getAttribute("data-variant")).toBe(variant);
  });

  it("uses a pinned variant over the pathname", () => {
    nav.pathname = "/ajustes/apariencia";
    render(<RouteLoading variant="table" />);
    expect(screen.getByTestId("skeleton").getAttribute("data-variant")).toBe("table");
  });
});

describe("PermissionDenied", () => {
  it("shows the default copy without an action", () => {
    render(<PermissionDenied />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tienes permiso para ver esta página.");
    expect(status.textContent).toContain("Pídele acceso a un administrador.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a link action", () => {
    render(<PermissionDenied title="Solo administradores" action={{ label: "Ir a Inicio", href: "/inicio" }} />);
    expect(screen.getByText("Solo administradores")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a Inicio" }).getAttribute("href")).toBe("/inicio");
  });

  it("renders a button action", () => {
    const onClick = vi.fn();
    render(<PermissionDenied action={{ label: "Pedir acceso", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Pedir acceso" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

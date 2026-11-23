import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/actions/app-settings-actions", () => ({ setNavVisibilityAction: mocks.save }));

import { AjustesMenuClient } from "./AjustesMenuClient";

const ETAPAS = [
  { key: "presale", name: "Presale" },
  { key: "diseno", name: "Diseño" },
];

function renderMenu(initialHidden: string[] = []) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AjustesMenuClient initialHidden={initialHidden} etapas={ETAPAS} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AjustesMenuClient", () => {
  it("labels one switch per element, with Chavita by its current name", () => {
    renderMenu();
    for (const name of [
      "Mostrar Buscar en el menú",
      "Mostrar Jornada en el menú",
      "Mostrar Calendario en el menú",
      "Mostrar Chavita en el menú",
      "Mostrar Tareas por proyecto en el menú",
      "Mostrar Lista de proyectos en el menú",
      "Mostrar Etapas en el menú",
      "Mostrar Diseño en el menú",
    ]) {
      expect(screen.getByRole("switch", { name })).toBeTruthy();
    }
  });

  it("shows Ajustes disabled with an explanation", () => {
    renderMenu();
    const ajustes = screen.getByRole("switch", { name: "Mostrar Ajustes en el menú" });
    expect(ajustes.hasAttribute("disabled") || ajustes.getAttribute("aria-disabled") === "true").toBe(true);
    expect(screen.getByText(/Ajustes no se puede ocultar/)).toBeTruthy();
  });

  it("saves the hidden keys", async () => {
    mocks.save.mockResolvedValue({ ok: true, data: { hidden: ["calendario"], savedAt: "2026-11-04T16:30:00.000Z" } });
    renderMenu();
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar Calendario en el menú" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(["calendario"]));
  });

  it("turns everything back on with Mostrar todo", () => {
    renderMenu(["calendario", "etapa:diseno"]);
    expect(screen.getByRole("switch", { name: "Mostrar Calendario en el menú" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todo" }));
    expect(screen.getByRole("switch", { name: "Mostrar Calendario en el menú" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Mostrar Diseño en el menú" }).getAttribute("aria-checked")).toBe("true");
  });
});

// @vitest-environment happy-dom
/** The Registro shows Spanish notes, never the CLI's English output or server paths (#679). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { JobProgress } from "./JobProgress";
import type { MondayImportJob } from "@/lib/types/monday-import";

const job: MondayImportJob = {
  kind: "export",
  status: "succeeded",
  startedAt: "2026-11-04T00:00:00.000Z",
  finishedAt: "2026-11-04T00:01:00.000Z",
  progress: { done: 2, total: 2, label: "Exportación terminada" },
  log: ["Export finished: 2/2 boards in /data/monday/0f/run (12 calls this run)."],
  notes: ["Exportando tableros", "Exportando tableros (2 de 2)", "Terminado."],
  error: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("JobProgress", () => {
  it("shows the Spanish notes and keeps the English log out of the page", () => {
    render(<JobProgress job={job} title="Exportación" />);
    expect(screen.getByText("Exportando tableros (2 de 2)")).toBeTruthy();
    expect(screen.queryByText(/Export finished/)).toBeNull();
    expect(document.body.textContent).not.toContain("/data/monday");
  });

  it("downloads the English log as a file", () => {
    const createObjectURL = vi.fn(() => "blob:registro");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<JobProgress job={job} title="Exportación" />);
    fireEvent.click(screen.getByRole("button", { name: /Descargar registro técnico/, hidden: true }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("works with a job saved before notes existed", () => {
    render(<JobProgress job={{ ...job, notes: undefined }} title="Exportación" />);
    expect(screen.getByRole("button", { name: /Descargar registro técnico/, hidden: true })).toBeTruthy();
  });
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createTicketAction: vi.fn(),
  uploadTicketAttachments: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: m.toastSuccess, error: m.toastError } }));
vi.mock("@/lib/actions/soporte-actions", () => ({ createTicketAction: m.createTicketAction }));
vi.mock("@/lib/soporte/attachments-client", () => ({ uploadTicketAttachments: m.uploadTicketAttachments }));

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { useSoporteDraft } from "@/lib/stores/soporte-draft";

import { ReportarDialog } from "./ReportarDialog";

const png = () => new File([new Uint8Array([1, 2, 3])], "captura.png", { type: "image/png" });

function fill() {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "No guarda la tarea" } });
  fireEvent.change(screen.getByLabelText("¿Qué pasó?"), {
    target: { value: "Al pulsar guardar no pasa nada y se pierde el texto." },
  });
}

function renderDialog() {
  return renderWithQueryClient(<ReportarDialog open onOpenChange={vi.fn()} />, { client: createTestQueryClient() });
}

beforeEach(() => {
  vi.clearAllMocks();
  useSoporteDraft.getState().clearDraft();
  m.createTicketAction.mockResolvedValue({ ok: true, data: { id: "11111111-1111-4111-8111-111111111111", code: "SOL-0007" } });
  m.uploadTicketAttachments.mockResolvedValue({ saved: [], failed: [] });
});
afterEach(cleanup);

describe("ReportarDialog attachments", () => {
  it("shows the picker, rejects a file over the limits inline and previews a valid one", () => {
    renderDialog();
    expect(screen.getByText(/Pega, arrastra o elige hasta 3 imágenes/)).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Solo se aceptan imágenes");
    fireEvent.change(input, { target: { files: [png()] } });
    expect(screen.getByAltText("captura.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar captura.png" }));
    expect(screen.queryByAltText("captura.png")).toBeNull();
  });

  it("uploads the picked images to the new solicitud after creating it", async () => {
    renderDialog();
    fill();
    const file = png();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(m.uploadTicketAttachments).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", [file]));
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
    expect(m.toastError).not.toHaveBeenCalled();
  });

  it("keeps the solicitud and reports the images that failed", async () => {
    m.uploadTicketAttachments.mockResolvedValue({ saved: [], failed: [{ name: "captura.png", error: "La imagen pesa más de 5 MB." }] });
    renderDialog();
    fill();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [png()] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(m.toastError).toHaveBeenCalled());
    expect(m.toastError.mock.calls[0][0]).toContain("captura.png");
    expect(m.toastSuccess).toHaveBeenCalled();
  });

  it("makes no upload call when there are no images", async () => {
    renderDialog();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
    expect(m.uploadTicketAttachments).not.toHaveBeenCalled();
  });
});

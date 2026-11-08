// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { VacationRequest } from "@/lib/types/redesign";

const actions = vi.hoisted(() => ({ requestVacationAction: vi.fn() }));
vi.mock("@/lib/actions/vacations-actions", () => actions);
const pageData = vi.hoisted(() => ({ getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => pageData);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The sheet shell is the pattern's concern; here it only has to show the
// fields, the inline error it is handed and the submit button.
vi.mock("@/components/patterns/FormSheet", () => ({
  FormSheet: (props: {
    title: string;
    open: boolean;
    onSubmit(): Promise<void>;
    submitLabel: string;
    error?: string | null;
    children: ReactNode;
  }) =>
    props.open ? (
      <div role="dialog" aria-label={props.title}>
        {props.children}
        {props.error ? <div role="alert">{props.error}</div> : null}
        <button type="button" onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { MyVacations } from "@/lib/vacations/reads";
import type { VacationBalance } from "@/lib/types/redesign";

import { VacationForm } from "./VacationForm";
import { BALANCE, misVacacionesData, seededVacacionesClient } from "./vacaciones.fixtures";

function renderForm(balance: VacationBalance = BALANCE) {
  const client = seededVacacionesClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(<VacationForm balance={balance} />, { client });
  return { ...view, invalidate };
}

const CREATED: VacationRequest = {
  id: "new",
  from: "2099-12-14",
  to: "2099-12-18",
  kind: "vacaciones",
  comment: "",
  status: "pendiente",
};

function openAndFill(from: string, to: string) {
  fireEvent.click(screen.getByRole("button", { name: /Nueva solicitud/ }));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: to } });
}

beforeEach(() => {
  vi.clearAllMocks();
  pageData.getMisVacacionesPageData.mockResolvedValue(misVacacionesData());
});

afterEach(() => {
  cleanup();
});

describe("VacationForm", () => {
  it("shows the OVERLAP copy when the dates collide with another request", async () => {
    actions.requestVacationAction.mockResolvedValue({ ok: false, error: "OVERLAP: req-1" });
    const { client } = renderForm();

    openAndFill("2099-12-14", "2099-12-18");
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Ya tienes una solicitud en esas fechas.");
    expect(client.getQueryData<MyVacations>(qk.me.vacations())?.requests.some((r) => r.id === "new")).toBe(false);
    expect(screen.getByRole("dialog", { name: "Nueva solicitud" })).toBeTruthy();
  });

  it("shows the thrown error copy too (an action that throws)", async () => {
    actions.requestVacationAction.mockRejectedValue(new Error("OVERLAP: req-1"));
    renderForm();
    openAndFill("2099-12-14", "2099-12-18");
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ya tienes una solicitud en esas fechas.");
  });

  it("sends the request, shows it in me.vacations and invalidates the vacation keys", async () => {
    actions.requestVacationAction.mockResolvedValue({ ok: true, data: CREATED });
    const { client, invalidate } = renderForm();

    openAndFill("2099-12-14", "2099-12-18");
    fireEvent.change(screen.getByLabelText("Comentario"), { target: { value: "  Fin de año  " } });
    expect(screen.getByText("5 días hábiles")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() =>
      expect(client.getQueryData<MyVacations>(qk.me.vacations())?.requests[0]).toEqual(CREATED),
    );
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      qk.me.vacations(),
      ["vacations", "absences"],
      qk.vacations.pending(),
    ]);
    expect(actions.requestVacationAction).toHaveBeenCalledWith({
      from: "2099-12-14",
      to: "2099-12-18",
      kind: "vacaciones",
      comment: "Fin de año",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("rejects an empty range locally with the INVALID copy", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /Nueva solicitud/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(actions.requestVacationAction).not.toHaveBeenCalled();
  });

  it("warns, without blocking, when the request goes past the balance", async () => {
    actions.requestVacationAction.mockResolvedValue({ ok: true, data: CREATED });
    renderForm({ ...BALANCE, available: 2 });

    openAndFill("2099-12-14", "2099-12-18");

    expect(screen.getByText(/pasa tu saldo por 3 días/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    await waitFor(() => expect(actions.requestVacationAction).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

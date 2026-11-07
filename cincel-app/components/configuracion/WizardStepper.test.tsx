// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { WizardStepper, wizardStepState } from "./WizardStepper";

const STEPS = [
  { id: "uno", label: "Cuenta" },
  { id: "dos", label: "Grupos de Google" },
  { id: "tres", label: "Importar de monday" },
  { id: "cuatro", label: "Listo" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

afterEach(cleanup);

function items() {
  return within(screen.getByRole("list", { name: "Pasos" })).getAllByRole("listitem");
}

describe("wizardStepState", () => {
  it("is done before the current step, current on it and upcoming after it", () => {
    expect(wizardStepState(0, 1)).toBe("done");
    expect(wizardStepState(1, 1)).toBe("current");
    expect(wizardStepState(2, 1)).toBe("upcoming");
  });
});

describe("WizardStepper", () => {
  it("marks the done steps with a check and a «Completado» prefix", () => {
    render(<WizardStepper steps={STEPS} current="tres" />);
    const [first, second] = items();
    for (const item of [first, second]) {
      expect(item.dataset.state).toBe("done");
      expect(item.getAttribute("aria-current")).toBeNull();
      expect(item.textContent).toContain("Completado:");
      expect(item.querySelector("svg")).not.toBeNull();
    }
    expect(first.textContent).toContain("Cuenta");
  });

  it("puts aria-current=step only on the current step, with its number and label", () => {
    render(<WizardStepper steps={STEPS} current="dos" />);
    const list = items();
    const current = list.filter((item) => item.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0].dataset.state).toBe("current");
    expect(current[0].textContent).toContain("2");
    expect(current[0].textContent).toContain("Grupos de Google");
    expect(current[0].textContent).not.toContain("Completado:");
  });

  it("shows the upcoming steps numbered, without a check", () => {
    render(<WizardStepper steps={STEPS} current="dos" />);
    const [, , third, fourth] = items();
    for (const [item, number] of [
      [third, "3"],
      [fourth, "4"],
    ] as const) {
      expect(item.dataset.state).toBe("upcoming");
      expect(item.getAttribute("aria-current")).toBeNull();
      expect(item.textContent).toContain(number);
      expect(item.querySelector("svg")).toBeNull();
    }
  });

  it("renders no buttons when jumping back is not offered", () => {
    render(<WizardStepper steps={STEPS} current="cuatro" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("turns a done step into «Volver a …» when it can be reopened", () => {
    const onJump = vi.fn();
    render(
      <WizardStepper<StepId>
        steps={STEPS}
        current="tres"
        canJump={(step) => step === "uno"}
        onJump={onJump}
      />,
    );
    expect(screen.queryByRole("button", { name: "Volver a Grupos de Google" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Volver a Cuenta" }));
    expect(onJump).toHaveBeenCalledWith("uno");
  });
});

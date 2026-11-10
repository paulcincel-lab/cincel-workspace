// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";

afterEach(() => {
  cleanup();
});

describe("SettingsSection", () => {
  it("renders a region named by its title, with description, actions and rows", () => {
    render(
      <SettingsSection
        title="Enlaces de la organización"
        description="Aparecen en el menú de tu perfil."
        actions={<Button variant="outline">Restablecer</Button>}
      >
        <SettingsRow label="Instagram" htmlFor="ig" control={<Input id="ig" />} />
        <SettingsRow label="Sitio web" htmlFor="web" control={<Input id="web" />} />
      </SettingsSection>,
    );

    const region = screen.getByRole("region", { name: "Enlaces de la organización" });
    expect(screen.getByRole("heading", { level: 2, name: "Enlaces de la organización" })).toBeTruthy();
    const descriptionId = region.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toBe("Aparecen en el menú de tu perfil.");
    expect(screen.getByRole("button", { name: "Restablecer" })).toBeTruthy();
    expect(region.querySelectorAll('[data-slot="settings-row"]')).toHaveLength(2);
  });

  it("omits description and actions when not given", () => {
    const { container } = render(
      <SettingsSection title="Modo">
        <SettingsRow label="Oscuro" htmlFor="m" control={<Input id="m" />} />
      </SettingsSection>,
    );
    const region = screen.getByRole("region", { name: "Modo" });
    expect(region.hasAttribute("aria-describedby")).toBe(false);
    expect(container.querySelector('[data-slot="settings-section-description"]')).toBeNull();
    expect(container.querySelector('[data-slot="settings-section-actions"]')).toBeNull();
  });

  it("puts the title and the control on one row with inline", () => {
    render(
      <SettingsSection title="Modo" description="Claro, oscuro o el de tu sistema." inline>
        <Button variant="outline">Claro</Button>
      </SettingsSection>,
    );
    const region = screen.getByRole("region", { name: "Modo" });
    expect(region.hasAttribute("data-inline")).toBe(true);
    expect(region.className).toMatch(/flex-row/);
    expect(region.className).toMatch(/flex-wrap/);
    expect(region.className).toMatch(/justify-between/);
  });

  it("titles the section with an h3 under an admin page heading", () => {
    render(
      <SettingsSection title="Enlaces" level={3}>
        <span />
      </SettingsSection>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Enlaces" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Enlaces" })).toBeTruthy();
  });

  it("gives each section its own ids", () => {
    render(
      <>
        <SettingsSection title="Uno" description="a">
          <span />
        </SettingsSection>
        <SettingsSection title="Dos" description="b">
          <span />
        </SettingsSection>
      </>,
    );
    const [one, two] = screen.getAllByRole("region");
    expect(one.getAttribute("aria-labelledby")).not.toBe(two.getAttribute("aria-labelledby"));
  });
});

describe("SettingsRow", () => {
  it("binds the label to its control with htmlFor", () => {
    render(
      <SettingsRow
        label="Horas por semana"
        description="Se usa para calcular tu cumplimiento."
        htmlFor="horas"
        control={<Input id="horas" type="number" />}
      />,
    );
    const input = screen.getByLabelText("Horas por semana");
    expect(input.id).toBe("horas");
    const label = document.querySelector('label[for="horas"]');
    expect(label?.textContent).toBe("Horas por semana");
    expect(screen.getByText("Se usa para calcular tu cumplimiento.")).toBeTruthy();
  });

  it("clicking the label activates the bound control", () => {
    render(<SettingsRow label="Correo" htmlFor="correo" control={<Input id="correo" />} />);
    const label = screen.getByText("Correo") as HTMLLabelElement;
    const input = document.getElementById("correo") as HTMLInputElement;
    // Browsers focus a text input when its label is activated; happy-dom only
    // forwards the click, so assert the binding and the forwarded activation.
    expect(label.control).toBe(input);
    let activated = 0;
    input.addEventListener("click", () => {
      activated += 1;
    });
    fireEvent.click(label);
    expect(activated).toBe(1);
  });

  it("names and describes a compound control as a group when there is no htmlFor", () => {
    render(
      <SettingsRow
        label="Densidad"
        description="Espacio entre elementos."
        control={
          <div>
            <Button variant="outline">Cómoda</Button>
            <Button variant="outline">Compacta</Button>
          </div>
        }
      />,
    );
    const group = screen.getByRole("group", { name: "Densidad" });
    const describedBy = group.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toBe("Espacio entre elementos.");
    expect(document.querySelector("label")).toBeNull();
  });

  it("keeps the controls in the keyboard order", () => {
    render(
      <SettingsSection title="Perfil">
        <SettingsRow label="Nombre" htmlFor="n" control={<Input id="n" />} />
        <SettingsRow label="Puesto" htmlFor="p" control={<Input id="p" />} />
      </SettingsSection>,
    );
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.map((i) => i.id)).toEqual(["n", "p"]);
    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);
  });
});

describe("pattern rules", () => {
  const source = ["SettingsSection.tsx", "SettingsRow.tsx"].map((f) =>
    readFileSync(resolve(__dirname, "..", f), "utf8"),
  );

  it("ignores the presentation style", () => {
    for (const s of source) {
      expect(s).not.toMatch(/StyleView|useStyle|data-style/);
    }
  });

  it("uses no raw colors and no weight above 600", () => {
    for (const s of source) {
      expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(|font-bold|font-extrabold|font-black/);
      expect(s).not.toMatch(/\b(?:text|bg|border)-(?:red|blue|green|gray|slate|zinc|neutral|amber|yellow)-\d/);
    }
  });
});

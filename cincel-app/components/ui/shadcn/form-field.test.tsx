// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { FormField } from "./form-field";
import { Input } from "./input";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Textarea } from "./textarea";

describe("FormField", () => {
  afterEach(cleanup);

  it("links its Label to an Input", () => {
    render(
      <FormField>
        <Label>Teléfono</Label>
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText("Teléfono");
    expect(input.tagName).toBe("INPUT");
    expect(input.id).not.toBe("");
  });

  it("links its Label to a Textarea", () => {
    render(
      <FormField>
        <Label>Notas</Label>
        <Textarea />
      </FormField>,
    );
    expect(screen.getByLabelText("Notas").tagName).toBe("TEXTAREA");
  });

  it("names a SelectTrigger with its Label", () => {
    render(
      <FormField>
        <Label>Estado</Label>
        <Select items={{ activo: "Activo" }} value="activo">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activo">Activo</SelectItem>
          </SelectContent>
        </Select>
      </FormField>,
    );
    expect(screen.getByRole("combobox", { name: "Estado" })).toBeTruthy();
  });

  it("gives each field its own id", () => {
    render(
      <>
        <FormField>
          <Label>Nombre</Label>
          <Input />
        </FormField>
        <FormField>
          <Label>Email</Label>
          <Input />
        </FormField>
      </>,
    );
    expect(screen.getByLabelText("Nombre").id).not.toBe(screen.getByLabelText("Email").id);
  });

  it("keeps an explicit id and htmlFor", () => {
    render(
      <FormField>
        <Label htmlFor="custom-id">Ubicación</Label>
        <Input id="custom-id" />
      </FormField>,
    );
    expect(screen.getByLabelText("Ubicación").id).toBe("custom-id");
  });

  it("leaves Label and Input untouched outside a FormField", () => {
    render(
      <>
        <Label>Suelto</Label>
        <Input placeholder="sin campo" />
      </>,
    );
    expect(screen.getByText("Suelto").hasAttribute("for")).toBe(false);
    expect(screen.getByPlaceholderText("sin campo").hasAttribute("id")).toBe(false);
  });
});

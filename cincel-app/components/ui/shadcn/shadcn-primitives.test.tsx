import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

describe("Button", () => {
  it("renders each variant without crashing and fires onClick", () => {
    const onClick = vi.fn();
    const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

    for (const variant of variants) {
      const { unmount } = render(
        <Button variant={variant} onClick={onClick}>
          {variant}
        </Button>
      );
      fireEvent.click(screen.getByText(variant));
      unmount();
    }

    expect(onClick).toHaveBeenCalledTimes(variants.length);
  });

  it("respects disabled state", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    fireEvent.click(screen.getByText("Disabled"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("renders and calls onChange", () => {
    const onChange = vi.fn();
    render(<Input placeholder="Nombre" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Nombre");
    fireEvent.change(input, { target: { value: "hola" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Textarea", () => {
  it("renders and calls onChange", () => {
    const onChange = vi.fn();
    render(<Textarea placeholder="Notas" onChange={onChange} />);
    const textarea = screen.getByPlaceholderText("Notas");
    fireEvent.change(textarea, { target: { value: "nota" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Label", () => {
  it("renders with htmlFor", () => {
    render(<Label htmlFor="field-id">Campo</Label>);
    const label = screen.getByText("Campo");
    expect(label.getAttribute("for")).toBe("field-id");
  });
});

describe("Select", () => {
  it("renders trigger with placeholder", () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Elige una opción" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Opción A</SelectItem>
          <SelectItem value="b">Opción B</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText("Elige una opción")).toBeTruthy();
  });

  it("opens popup and selects an item, firing onValueChange", async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Elige una opción" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Opción A</SelectItem>
          <SelectItem value="b">Opción B</SelectItem>
        </SelectContent>
      </Select>
    );

    fireEvent.click(screen.getByText("Elige una opción"));
    const option = await screen.findByText("Opción A");
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith("a", expect.anything());
  });
});

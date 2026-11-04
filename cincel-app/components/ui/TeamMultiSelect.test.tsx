// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import TeamMultiSelect from "./TeamMultiSelect";

describe("TeamMultiSelect locked options", () => {
  afterEach(cleanup);

  it("does not add or remove a locked option", () => {
    const onChange = vi.fn();
    render(
      <TeamMultiSelect
        options={["Ana", "Luis", "Marta"]}
        selected={["Ana"]}
        onChange={onChange}
        locked={["Ana", "Luis"]}
        lockedTitle="Se administra en Google Workspace"
      />,
    );
    for (const button of screen.getAllByTitle("Se administra en Google Workspace")) fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Marta"));
    expect(onChange).toHaveBeenCalledWith(["Ana", "Marta"]);
  });
});

describe("TeamMultiSelect empty text", () => {
  afterEach(cleanup);

  it("defaults to the members empty text and accepts a custom one", () => {
    const { rerender } = render(<TeamMultiSelect options={["Diseño"]} selected={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Sin integrantes asignados")).toBeTruthy();

    rerender(
      <TeamMultiSelect options={["Diseño"]} selected={[]} onChange={vi.fn()} emptyText="Sin workflows asignados" />,
    );
    expect(screen.getByText("Sin workflows asignados")).toBeTruthy();
    expect(screen.queryByText("Sin integrantes asignados")).toBeNull();
  });
});

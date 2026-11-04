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

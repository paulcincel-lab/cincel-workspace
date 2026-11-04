// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogFooter, DialogTitle } from "./dialog";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

afterEach(cleanup);

describe("close labels", () => {
  it("labels the dialog close controls in Spanish", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Nuevo estatus</DialogTitle>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getAllByRole("button", { name: "Cerrar" })).toHaveLength(2);
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("labels the sheet close control in Spanish", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Agregar recurso</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    expect(screen.queryByText("Close")).toBeNull();
  });
});

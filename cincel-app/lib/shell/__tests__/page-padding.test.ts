import { describe, expect, it } from "vitest";

import {
  FULL_BLEED_CONTENT_CLASS,
  PAGE_CONTENT_CLASS,
  isFullBleedRoute,
  pageContentClass,
} from "../page-padding";

describe("page padding", () => {
  it("uses 16 px on mobile and 20px 28px 40px with a 16 px gap from 768 px up", () => {
    const classes = PAGE_CONTENT_CLASS.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["p-4", "md:px-7", "md:pt-5", "md:pb-10", "gap-4", "flex-col"]));
  });

  it.each(["/inicio", "/tareas", "/proyectos", "/personas", "/mi-espacio", "/biblioteca", "/ajustes", "/ajustes/tema"])(
    "pads %s",
    (pathname) => {
      expect(isFullBleedRoute(pathname)).toBe(false);
      expect(pageContentClass(pathname)).toBe(PAGE_CONTENT_CLASS);
    },
  );

  it("leaves the Asistente page full bleed", () => {
    expect(isFullBleedRoute("/asistente")).toBe(true);
    expect(isFullBleedRoute("/asistente/abc")).toBe(true);
    expect(pageContentClass("/asistente")).toBe(FULL_BLEED_CONTENT_CLASS);
  });

  it("does not match routes that only share the prefix text", () => {
    expect(isFullBleedRoute("/asistentes")).toBe(false);
  });

  it("pads when the pathname is unknown", () => {
    expect(pageContentClass(null)).toBe(PAGE_CONTENT_CLASS);
    expect(pageContentClass(undefined)).toBe(PAGE_CONTENT_CLASS);
  });
});

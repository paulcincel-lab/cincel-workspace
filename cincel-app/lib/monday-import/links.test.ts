// @vitest-environment node
/** Links on the import result screen open the project's Ficha (#677). */
import { describe, expect, it } from "vitest";

import { projectSectionLinks } from "@/components/proyectos/ProjectSectionNav";

import { importedProjectHref } from "./links";

describe("importedProjectHref", () => {
  it("links to the project's Ficha", () => {
    expect(importedProjectHref("3f2a9c4e-0000-4000-8000-000000000001")).toBe(
      "/proyectos/3f2a9c4e-0000-4000-8000-000000000001/ficha",
    );
  });

  it("matches the Ficha tab of the project nav", () => {
    const ficha = projectSectionLinks("p-1").find((link) => link.section === "ficha");
    expect(importedProjectHref("p-1")).toBe(ficha?.href);
  });

  it("encodes the id", () => {
    expect(importedProjectHref("a/b c")).toBe("/proyectos/a%2Fb%20c/ficha");
  });
});

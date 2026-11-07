// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { AssistantSheetProps } from "@/components/asistente/AssistantSheet";
import { documentToc, empresaDoc, empresaDocLinks } from "@/lib/biblioteca/catalog";

import { bibliotecaFixture } from "./biblioteca.fixtures";
import { DocumentReader } from "./DocumentReader";

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchAssistantThreadsAction: false,
    fetchAssistantThreadAction: false,
    deleteAssistantThreadAction: false,
    importLegacyAssistantThreadAction: false,
    fetchAssistantActionsAction: false,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/assistant-actions.flags", () => flags);

const sheet = vi.hoisted(() => ({ renders: [] as AssistantSheetProps[] }));
vi.mock("@/components/asistente/AssistantSheet", () => ({
  AssistantSheet: (props: AssistantSheetProps) => {
    sheet.renders.push(props);
    return props.open ? <div role="dialog" aria-label="Asistente">{props.context.route}</div> : null;
  },
}));

// The workspace viewer embeds Drive iframes; the reader only needs to hand it the part.
vi.mock("@/components/recursos/ResourcePreview", () => ({
  ResourcePreview: ({ link }: { link: { title: string } | null }) => <div data-testid="preview">{link?.title}</div>,
  DriveFilePreviewSheet: () => null,
}));

function setAssistantFlags(value: boolean) {
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = value;
}

const doc = empresaDoc("manual-de-la-empresa")!;
const parts = empresaDocLinks(bibliotecaFixture(), "manual-de-la-empresa");
const toc = documentToc(parts, doc);

function renderReader(partIndex = 1, driveEnabled = false) {
  return render(
    <DocumentReader
      doc={parts[partIndex]}
      toc={toc}
      companyDoc={{ slug: doc.slug, title: doc.title, description: doc.description }}
      driveEnabled={driveEnabled}
    />,
  );
}

describe("DocumentReader", () => {
  beforeEach(() => {
    window.localStorage.clear();
    sheet.renders = [];
    setAssistantFlags(false);
  });
  afterEach(() => cleanup());

  it("renders the TOC with one entry per part and marks the current one", () => {
    renderReader(1);
    const nav = within(screen.getByRole("navigation", { name: "Contenido" }));
    const entries = nav.getAllByRole("link");
    expect(entries.map((a) => a.textContent)).toEqual(["1Cómo trabajamos", "2Cómo abrimos un proyecto"]);
    expect(entries[0].getAttribute("href")).toBe("/biblioteca/empresa/manual-de-la-empresa?parte=manual-1");
    expect(entries[1].getAttribute("aria-current")).toBe("page");
    expect(entries[0].getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Cómo abrimos un proyecto" })).toBeTruthy();
    expect(screen.getByText("Sección 2")).toBeTruthy();
  });

  it("links the previous part and shows the details panel", () => {
    renderReader(1);
    const sections = within(screen.getByRole("navigation", { name: "Secciones" }));
    expect(sections.getByRole("link", { name: /1\. Cómo trabajamos/ }).getAttribute("href")).toBe(
      "/biblioteca/empresa/manual-de-la-empresa?parte=manual-1",
    );
    const details = within(screen.getByRole("complementary", { name: "Detalles del documento" }));
    expect(details.getByText("4 nov")).toBeTruthy();
    expect(details.getByText("Ana Ríos")).toBeTruthy();
    expect(details.getByText("Todo el equipo")).toBeTruthy();
  });

  it("offers 'Descargar PDF' only when the Drive integration is configured", () => {
    renderReader(0, false);
    expect(screen.queryByRole("link", { name: /Descargar/ })).toBeNull();
    cleanup();
    renderReader(0, true);
    const downloads = screen.getAllByRole("link", { name: /Descargar PDF/ });
    expect(downloads.length).toBeGreaterThan(0);
    expect(downloads[0].getAttribute("href")).toBe("/api/google/drive/file/docmanual1/content");
  });

  it("hides 'Preguntar al asistente…' and never mounts the sheet while the assistant flags are off", () => {
    renderReader(1);
    expect(screen.queryByRole("button", { name: "Preguntar al asistente sobre este documento" })).toBeNull();
    expect(sheet.renders).toEqual([]);
  });

  it("stays hidden while any assistant flag is still off", () => {
    setAssistantFlags(true);
    flags.IMPLEMENTED.fetchAssistantActionsAction = false;
    renderReader(1);
    expect(screen.queryByRole("button", { name: "Preguntar al asistente sobre este documento" })).toBeNull();
    expect(sheet.renders).toEqual([]);
  });

  it("opens the assistant sheet with the document in context when the flags are on", () => {
    setAssistantFlags(true);
    renderReader(1);
    fireEvent.click(screen.getByRole("button", { name: "Preguntar al asistente sobre este documento" }));
    const dialog = screen.getByRole("dialog", { name: "Asistente" });
    expect(dialog.textContent).toBe("/biblioteca/empresa/manual-de-la-empresa?parte=manual-2");
    expect(sheet.renders.at(-1)?.context).toEqual({ route: "/biblioteca/empresa/manual-de-la-empresa?parte=manual-2" });
  });

  it("remembers the part in the existing recent-documents key", () => {
    renderReader(1);
    const stored = JSON.parse(window.localStorage.getItem("cincel.resources.recent-docs.v1") ?? "[]");
    expect(stored[0]).toMatchObject({
      id: "manual-2",
      section: "empresa",
      href: "/biblioteca/empresa/manual-de-la-empresa?parte=manual-2",
    });
  });
});

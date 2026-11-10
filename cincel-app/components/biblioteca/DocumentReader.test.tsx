// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

import { documentToc, empresaDoc, empresaDocLinks } from "@/lib/biblioteca/catalog";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";

import { bibliotecaFixture, seededBibliotecaClient } from "./biblioteca.fixtures";
import { DocumentReader, EmpresaDocument } from "./DocumentReader";

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

vi.mock("@/lib/actions/page-data/biblioteca-actions", () => ({
  getBibliotecaPageData: vi.fn(),
  getMisVacacionesPageData: vi.fn(),
}));
vi.mock("@/lib/actions/resources-actions", () => ({
  recordResourceOpenAction: vi.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
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
  return renderWithQueryClient(
    <DocumentReader
      doc={parts[partIndex]}
      toc={toc}
      companyDoc={{ slug: doc.slug, title: doc.title, description: doc.description }}
    />,
    { client: seededBibliotecaClient("empresa", parts, { driveEnabled }) },
  );
}

describe("DocumentReader", () => {
  beforeEach(() => {
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

  it("offers 'Descargar PDF' only when the Drive status says it is configured", () => {
    renderReader(0, false);
    expect(screen.queryByRole("link", { name: /Descargar/ })).toBeNull();
    cleanup();
    renderReader(0, true);
    const downloads = screen.getAllByRole("link", { name: /Descargar PDF/ });
    expect(downloads.length).toBeGreaterThan(0);
    expect(downloads[0].getAttribute("href")).toBe("/api/google/drive/file/docmanual1/content");
  });

  it("hides 'Preguntar al asistente…' while the assistant flags are off", () => {
    renderReader(1);
    expect(screen.queryByRole("button", { name: "Preguntar al asistente sobre este documento" })).toBeNull();
  });

  it("stays hidden while any assistant flag is still off", () => {
    setAssistantFlags(true);
    flags.IMPLEMENTED.fetchAssistantActionsAction = false;
    renderReader(1);
    expect(screen.queryByRole("button", { name: "Preguntar al asistente sobre este documento" })).toBeNull();
  });

  it("opens the shared assistant sheet with the document's route as context", () => {
    setAssistantFlags(true);
    const openAssistant = vi.spyOn(useAssistantUi.getState(), "openAssistant");
    renderReader(1);
    fireEvent.click(screen.getByRole("button", { name: "Preguntar al asistente sobre este documento" }));
    expect(openAssistant).toHaveBeenCalledWith({ context: { route: "/biblioteca/empresa/manual-de-la-empresa?parte=manual-2" } });
    openAssistant.mockRestore();
  });

  it("puts the store in the open state with the route override", () => {
    setAssistantFlags(true);
    renderReader(1);
    fireEvent.click(screen.getByRole("button", { name: "Preguntar al asistente sobre este documento" }));
    expect(useAssistantUi.getState()).toMatchObject({
      open: true,
      contextOverride: { route: "/biblioteca/empresa/manual-de-la-empresa?parte=manual-2" },
    });
  });

  it("mounts no assistant sheet of its own (no AssistantSheet import)", () => {
    const source = readFileSync(join(__dirname, "DocumentReader.tsx"), "utf8");
    expect(source).not.toMatch(/AssistantSheet|@ai-sdk\/react|react-markdown|recharts/);
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

describe("EmpresaDocument", () => {
  afterEach(() => cleanup());

  it("reads the document's parts from biblioteca.links('empresa') and shows ?parte=", () => {
    renderWithQueryClient(<EmpresaDocument slug="manual-de-la-empresa" parte="manual-2" />, {
      client: seededBibliotecaClient("empresa", bibliotecaFixture()),
    });
    expect(screen.getByRole("heading", { level: 2, name: "Cómo abrimos un proyecto" })).toBeTruthy();
  });

  it("shows the empty state when Dirección added no part yet", () => {
    renderWithQueryClient(<EmpresaDocument slug="book" parte={null} />, {
      client: seededBibliotecaClient("empresa", []),
    });
    expect(screen.getByText("Aún no hay documentos en Book")).toBeTruthy();
  });
});

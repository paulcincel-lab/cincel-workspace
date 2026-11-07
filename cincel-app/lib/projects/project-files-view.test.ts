import { describe, expect, it, vi } from "vitest";

// The shared helpers live next to the files browser, which imports a server action.
vi.mock("@/lib/actions/projects-actions", () => ({ retryProjectFolderAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  fileIconName,
  fileTypeLabel,
  filesCount,
  folderContext,
  formatFileDate,
  toFileCards,
  toFileTable,
  toStorageByType,
  type OkFilesResult,
} from "./project-files-view";

const FOLDER = "application/vnd.google-apps.folder";

function listing(overrides: Partial<OkFilesResult> = {}): OkFilesResult {
  return {
    status: "ok",
    folderId: "root",
    breadcrumbs: [{ id: "root", name: "Casa Lomas" }],
    items: [
      { id: "f1", name: "01 Interno", mimeType: FOLDER, sizeBytes: null, modifiedAt: "2026-11-03T17:40:00Z", iconLink: null, webViewLink: null, kind: "folder" },
      { id: "a", name: "Planta arquitectónica.pdf", mimeType: "application/pdf", sizeBytes: 2_516_582, modifiedAt: "2026-11-03T17:40:00Z", iconLink: null, webViewLink: "https://drive.example/a", kind: "file" },
      { id: "b", name: "Instalación.dwg", mimeType: "application/octet-stream", sizeBytes: 6_081_741, modifiedAt: "2026-10-28T10:00:00Z", iconLink: null, webViewLink: null, kind: "file" },
      { id: "c", name: "Cortes.pdf", mimeType: "application/pdf", sizeBytes: 1_048_576, modifiedAt: "", iconLink: null, webViewLink: null, kind: "file" },
    ],
    ...overrides,
  };
}

describe("file labels", () => {
  it("uses the extension, Google types and MIME families", () => {
    expect(fileTypeLabel({ name: "x.pdf", mimeType: "application/pdf", kind: "file" })).toBe("PDF");
    expect(fileTypeLabel({ name: "plano.dwg", mimeType: "application/octet-stream", kind: "file" })).toBe("DWG");
    expect(fileTypeLabel({ name: "Minuta", mimeType: "application/vnd.google-apps.document", kind: "file" })).toBe("Documento");
    expect(fileTypeLabel({ name: "foto", mimeType: "image/jpeg", kind: "file" })).toBe("Imagen");
    expect(fileTypeLabel({ name: "Renders", mimeType: FOLDER, kind: "folder" })).toBe("Carpeta");
    expect(fileIconName({ name: "Renders", mimeType: FOLDER, kind: "folder" })).toBe("folder");
    expect(fileIconName({ name: "costos.xlsx", mimeType: "application/octet-stream", kind: "file" })).toBe("file-spreadsheet");
  });

  it("formats dates in lowercase es-MX", () => {
    const text = formatFileDate("2026-11-03T17:40:00Z");
    expect(text).toBe(text.toLowerCase());
    expect(text).toContain("nov");
    expect(formatFileDate("")).toBe("—");
  });
});

describe("one listing, three styles", () => {
  it("builds folder cards that link to the folder and file cards that open in Drive", () => {
    const cards = toFileCards("p1", listing());
    expect(cards.map((c) => c.id)).toEqual(["f1", "a", "b", "c"]);
    expect(cards[0]).toMatchObject({ iconName: "folder", subtitle: "Solo el equipo", href: "/proyectos/p1/archivos?folder=f1" });
    expect(cards[1]).toMatchObject({ subtitle: "PDF", href: "https://drive.example/a" });
    expect(cards[2].href).toBeUndefined();
  });

  it("builds the file table with Nombre, Carpeta, Tipo, Tamaño, Modificado and totals", () => {
    const table = toFileTable(listing());
    expect(table.columns.map((c) => c.label)).toEqual(["Nombre", "Carpeta", "Tipo", "Tamaño", "Modificado"]);
    expect(table.rows).toHaveLength(4);
    expect(table.rows[1]).toMatchObject({ nombre: "Planta arquitectónica.pdf", carpeta: "Casa Lomas", tipo: "PDF" });
    expect(table.totals).toMatchObject({ nombre: "3 archivos" });
  });

  it("adds Versión and Autor only when the listing carries them", () => {
    const base = listing();
    const withMeta = listing({
      items: base.items.map((i) => (i.id === "a" ? { ...i, version: "3", author: "Paul Langarica" } : i)),
    });
    const labels = toFileTable(withMeta).columns.map((c) => c.label);
    expect(labels).toEqual(["Nombre", "Carpeta", "Tipo", "Tamaño", "Versión", "Autor", "Modificado"]);
    expect(toFileTable(withMeta).rows[1]).toMatchObject({ version: "v3", autor: "Paul Langarica" });
  });

  it("groups storage by type, largest first, files only", () => {
    const segments = toStorageByType(listing());
    expect(segments.map((s) => [s.label, s.value])).toEqual([
      ["DWG", 1],
      ["PDF", 2],
    ]);
    expect(segments.every((s) => s.colorVar.startsWith("var(--chart-"))).toBe(true);
    expect(segments[1].extra).toEqual({ tamano: "3.4 MB" });
  });

  it("knows the root and the current folder", () => {
    const nested = listing({
      folderId: "f1",
      breadcrumbs: [
        { id: "root", name: "Casa Lomas" },
        { id: "f1", name: "01 Interno" },
      ],
    });
    expect(folderContext(nested)).toEqual({
      root: { id: "root", name: "Casa Lomas" },
      current: { id: "f1", name: "01 Interno" },
      atRoot: false,
    });
    // Subfolder hints show only at the project root.
    expect(toFileCards("p1", nested)[0].subtitle).toBe("Carpeta");
  });

  it("counts the entries of a readable folder only", () => {
    expect(filesCount(listing())).toBe(4);
    expect(filesCount({ status: "needs_consent" })).toBe(0);
  });
});

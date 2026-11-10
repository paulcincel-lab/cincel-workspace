// @vitest-environment happy-dom
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

const seen = vi.hoisted(() => ({
  listPage: [] as { style: string; props: ListPageProps }[],
  distribution: [] as DistributionWidgetProps[],
}));

vi.mock("@/lib/actions/projects-actions", () => ({ retryProjectFolderAction: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));

// The pattern and the widget own the per-style rendering; the probe records
// what the tab hands them and renders the cards' footers so the detail panel
// can be opened.
vi.mock("@/components/patterns/ListPage", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  return {
    ListPage: (props: ListPageProps) => {
      const { style } = useStyle();
      seen.listPage.push({ style, props });
      const spec = props.spec;
      const empty = spec.kind === "cards" && spec.items.length === 0;
      return (
        <div data-testid="list-page">
          <h1>{props.header.title}</h1>
          {props.header.actions}
          {props.filters}
          {empty ? (
            <p data-testid="empty">{props.empty?.title}</p>
          ) : spec.kind === "cards" ? (
            <ul>
              {spec.items.map((item) => (
                <li key={item.id}>
                  {item.href ? <a href={item.href}>{item.title}</a> : item.title}
                  {spec.footer?.(item)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    },
  };
});
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: (props: DistributionWidgetProps) => {
    seen.distribution.push(props);
    return <div data-testid="storage">{props.title}</div>;
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { renderWithQueryClient } from "@/lib/query/test-utils";

import { EMPTY_FOLDER, EMPTY_PROJECT_FILES, ProjectFiles } from "./ProjectFiles";

const FOLDER = "application/vnd.google-apps.folder";

const OK: StaffFilesResult = {
  status: "ok",
  folderId: "root",
  breadcrumbs: [{ id: "root", name: "Casa Lomas" }],
  items: [
    { id: "f1", name: "02 Cliente", mimeType: FOLDER, sizeBytes: null, modifiedAt: "2026-11-03T17:40:00Z", iconLink: null, thumbnailLink: null, webViewLink: null, kind: "folder" },
    { id: "a", name: "Planta.pdf", mimeType: "application/pdf", sizeBytes: 2_516_582, modifiedAt: "2026-11-03T17:40:00Z", iconLink: null, thumbnailLink: null, webViewLink: "https://drive.example/a", kind: "file" },
  ],
};

function renderIn(style: PresentationStyle, result: StaffFilesResult = OK) {
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <ProjectFiles projectId="p1" result={result} canRetry />
    </StyleProvider>,
  );
}

beforeEach(() => {
  seen.listPage = [];
  seen.distribution = [];
});
afterEach(cleanup);

describe("ProjectFiles styles", () => {
  it("hands the same cards spec and storage data to the widgets in every style", () => {
    const specs: string[] = [];
    const storages: string[] = [];
    for (const style of ["visual", "esencial", "analitico"] as const) {
      seen.listPage = [];
      seen.distribution = [];
      renderIn(style);
      const last = seen.listPage.at(-1)!;
      expect(last.style).toBe(style);
      expect(last.props.spec.kind).toBe("cards");
      specs.push(JSON.stringify({ ...last.props.spec, footer: undefined }));
      storages.push(JSON.stringify(seen.distribution.at(-1)));
      cleanup();
    }
    expect(new Set(specs).size).toBe(1);
    expect(new Set(storages).size).toBe(1);
  });

  it("passes the Analítico file table and storage by type", () => {
    renderIn("analitico");
    const spec = seen.listPage.at(-1)!.props.spec;
    if (spec.kind !== "cards") throw new Error("expected cards");
    expect(spec.table.columns.map((c) => c.label)).toEqual(["Nombre", "Carpeta", "Tipo", "Tamaño", "Modificado"]);
    expect(seen.distribution.at(-1)).toMatchObject({ title: "Almacenamiento por tipo" });
    expect(seen.distribution.at(-1)!.segments.map((s) => s.label)).toEqual(["PDF"]);
  });

  it("opens the detail panel of a file from its card", () => {
    renderIn("visual");
    expect(screen.queryByRole("region", { name: "Detalles de Planta.pdf" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Detalles" }));
    const panel = screen.getByRole("region", { name: "Detalles de Planta.pdf" });
    expect(panel.textContent).toContain("PDF");
    expect(panel.textContent).toContain("Casa Lomas");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar detalles" }));
    expect(screen.queryByRole("region", { name: "Detalles de Planta.pdf" })).toBeNull();
  });

  it("links upload and Drive to the folder", () => {
    renderIn("visual");
    const upload = screen.getByRole("link", { name: "Subir archivos" });
    expect(upload.getAttribute("href")).toBe("https://drive.google.com/drive/folders/root");
    expect(upload.getAttribute("rel")).toContain("noopener");
  });
});

describe("ProjectFiles empty and folder states", () => {
  it("shows the project empty state with upload at the root", () => {
    renderIn("visual", { ...OK, items: [] });
    expect(screen.getByTestId("empty").textContent).toBe(EMPTY_PROJECT_FILES);
    expect(EMPTY_PROJECT_FILES).toBe("Este proyecto aún no tiene archivos");
    const empty = seen.listPage.at(-1)!.props.empty!;
    expect(empty.action).toEqual({ label: "Subir archivos", href: "https://drive.google.com/drive/folders/root" });
    expect(seen.distribution).toHaveLength(0);
  });

  it("shows the empty folder copy inside a subfolder", () => {
    renderIn("esencial", {
      status: "ok",
      folderId: "f1",
      breadcrumbs: [
        { id: "root", name: "Casa Lomas" },
        { id: "f1", name: "02 Cliente" },
      ],
      items: [],
    });
    expect(screen.getByTestId("empty").textContent).toBe(EMPTY_FOLDER);
    expect(seen.listPage.at(-1)!.props.empty!.action?.href).toBe("https://drive.google.com/drive/folders/f1");
  });

  it("keeps the files browser states for folders that can't be read", () => {
    renderIn("visual", { status: "needs_consent" });
    expect(screen.getByRole("link", { name: "Conectar Google Drive" })).toBeTruthy();
    expect(seen.listPage).toHaveLength(0);

    cleanup();
    renderIn("analitico", { status: "failed", error: "quota" });
    expect(screen.getByText("No se pudo crear la carpeta del proyecto en Drive.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar carpeta" })).toBeTruthy();
  });
});

describe("ProjectFiles folder navigation (5d)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/proyectos/p1/archivos"));

  it("opens a folder card on the client with pushState and no router.push", () => {
    const push = vi.spyOn(window.history, "pushState");
    renderIn("visual");
    const folder = screen.getByRole("link", { name: "02 Cliente" });
    expect(folder.getAttribute("href")).toBe("/proyectos/p1/archivos?folder=f1");

    fireEvent.click(folder);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(null, "", "/proyectos/p1/archivos?folder=f1");
    expect(router.push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("keeps the real link for modified clicks and leaves file links alone", () => {
    const push = vi.spyOn(window.history, "pushState");
    renderIn("visual");
    fireEvent.click(screen.getByRole("link", { name: "02 Cliente" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Planta.pdf" }));
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});

describe("ProjectFiles style guard", () => {
  it("never imports StyleView nor branches on the style", () => {
    const source = readFileSync(resolve(__dirname, "ProjectFiles.tsx"), "utf8");
    expect(source).not.toContain("StyleView");
    expect(source).not.toContain("useStyle");
  });
});

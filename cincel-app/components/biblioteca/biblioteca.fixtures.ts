import type { ResourceLink } from "@/lib/types/resource";

let seq = 0;

/** A resource link with sensible defaults for Biblioteca tests. */
export function makeLink(overrides: Partial<ResourceLink> = {}): ResourceLink {
  seq += 1;
  const id = overrides.id ?? `link-${seq}`;
  return {
    id,
    templateKey: null,
    title: `Documento ${seq}`,
    section: "formatos-obra",
    subsection: null,
    linkType: "drive_file",
    appliesTo: "general",
    url: `https://docs.google.com/document/d/doc${id.replace(/[^a-zA-Z0-9]/g, "")}/edit`,
    status: "vigente",
    owner: { id: "staff-ana", name: "Ana Ríos" },
    personalFor: null,
    sortOrder: 0,
    drive: null,
    createdAt: "2026-10-01T16:00:00.000Z",
    updatedAt: "2026-11-04T16:00:00.000Z",
    ...overrides,
  };
}

/** A small library: two Empresa parts of the Manual, Formatos de obra rows, a personal document and a favorite. */
export function bibliotecaFixture(): ResourceLink[] {
  return [
    makeLink({ id: "manual-1", section: "empresa", title: "Manual de la empresa · Cómo trabajamos", sortOrder: 1 }),
    makeLink({ id: "manual-2", section: "empresa", title: "Manual de la empresa · Cómo abrimos un proyecto", sortOrder: 2 }),
    makeLink({ id: "rfc-1", section: "empresa", title: "Constancia fiscal", templateKey: "rfc" }),
    makeLink({ id: "bitacora", section: "formatos-obra", title: "Bitácora de obra", appliesTo: "construccion", updatedAt: "2026-11-05T16:00:00.000Z" }),
    makeLink({ id: "acta", section: "formatos-obra", title: "Acta de entrega-recepción", appliesTo: "construccion", linkType: "drive_folder", url: "https://drive.google.com/drive/folders/actaFolder" }),
    makeLink({ id: "levantamiento", section: "formatos-obra", title: "Levantamiento del sitio", appliesTo: "general" }),
    makeLink({ id: "mis-docs", section: "mis-documentos", title: "Mis documentos", linkType: "drive_folder", url: "https://drive.google.com/drive/folders/misDocs", personalFor: { id: "staff-ana", name: "Ana Ríos" } }),
    makeLink({ id: "fav-bitacora", section: "mis-favoritos", title: "Bitácora de obra", url: "https://docs.google.com/document/d/docbitacora/edit", personalFor: { id: "staff-ana", name: "Ana Ríos" } }),
  ];
}

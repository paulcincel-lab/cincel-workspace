/**
 * Staff export, reusing lib/utils/export-service.ts (Phase 3, issue #301).
 *
 * `exportTableData` drives a browser download (xlsx via a client-side
 * writer, PDF via jsPDF's `document.save`), so this stays a plain client
 * module rather than a Server Action — a "use server" file cannot bundle
 * that browser-only code. Server Actions still own the data: callers fetch
 * staff through `fetchStaffAction` and pass the rows in here.
 */
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { Staff } from "@/lib/types/core";

export const STAFF_KIND_LABEL: Record<Staff["kind"], string> = {
  empleado: "Empleado",
  freelance: "Freelance",
  servicio_social: "Servicio Social",
};

export const staffExportColumns: ExportColumn<Staff>[] = [
  { key: "name", header: "Colaborador", getValue: (s) => s.name },
  { key: "role", header: "Puesto", getValue: (s) => s.role ?? "" },
  { key: "kind", header: "Tipo", getValue: (s) => STAFF_KIND_LABEL[s.kind] },
  { key: "email", header: "Correo", getValue: (s) => s.email ?? "" },
  { key: "phone", header: "Teléfono", getValue: (s) => s.phone ?? "" },
  { key: "capacity", header: "Capacidad", getValue: (s) => s.capacity },
  { key: "availability", header: "Disponibilidad", getValue: (s) => s.availability ?? "" },
  { key: "status", header: "Estado", getValue: (s) => (s.active ? "Activo" : "Desactivado") },
];

/** Real capability check — not a raw role string comparison. */
export function canExportStaff(user: AuthenticatedUser | null): boolean {
  return resolveTeamCapabilities(user).canExportData;
}

/**
 * Export the given staff rows. Throws if the current user's resolved
 * capabilities don't allow it, mirroring the FORBIDDEN pattern used by every
 * write in lib/actions.
 */
export async function exportStaffAction(
  rows: Staff[],
  format: "xlsx" | "pdf",
  options: { user: AuthenticatedUser | null; companyName: string }
): Promise<void> {
  if (!canExportStaff(options.user)) {
    throw new Error("FORBIDDEN: staff export");
  }
  await exportTableData({
    moduleName: "Equipo",
    fileName: `equipo-${Date.now()}`,
    format,
    companyName: options.companyName,
    columns: staffExportColumns,
    rows,
    landscape: true,
  });
}

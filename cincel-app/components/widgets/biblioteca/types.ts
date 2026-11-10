import type { ResourcesCapabilities } from "@/lib/auth/permissions";
import type { RecentDocument } from "@/lib/stores/recent-docs-store";
import type { ResourceLink } from "@/lib/types/resource";
import type { MyVacations } from "@/lib/vacations/reads";

/**
 * What `BibliotecaIndex` hands each style of the `/biblioteca` index
 * (`BibliotecaVisual`, `BibliotecaEsencial`, `BibliotecaAnalitico`): the
 * loaded data and the shared search state. The index owns the queries, the
 * `?q=` search and the "Subir documento" sheet; the layouts only render.
 */
export type BibliotecaLayoutProps = {
  /** `biblioteca.links(null)`: already filtered for the viewer. */
  links: ResourceLink[];
  capabilities: ResourcesCapabilities | null;
  /** `enterprise.canView`. */
  showEmpresa: boolean;
  /** `canViewResources`; without it only Empresa and Mis vacaciones show. */
  showRecursos: boolean;
  /** The search text as typed (the URL `?q=` follows after the debounce). */
  query: string;
  onQueryChange(value: string): void;
  /** "Abiertos recientemente" (`useRecentDocs`), newest first. */
  recents: RecentDocument[];
  /** `me.vacations` (null when the read is unavailable). */
  vacations: MyVacations | null;
  /** True only when nothing is cached yet (client navigation). */
  isPending: boolean;
  driveEnabled: boolean;
  /** Opens the "Subir documento" sheet; absent when the viewer may not add documents. */
  onUpload?: () => void;
  now: Date;
  /** YYYY-MM-DD in the organization's time zone. */
  today: string;
};

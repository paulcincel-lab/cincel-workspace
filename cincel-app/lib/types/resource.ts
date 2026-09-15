import type { DriveFileMeta, StaffRef } from "@/lib/types/core";

export type ResourceSection =
  | "mis-documentos"
  | "mis-favoritos"
  | "plantillas-diseno"
  | "formatos-obra"
  | "mis-vacaciones"
  | "formacion"
  | "empresa";

export type ResourceSubsection = "diseno" | "construccion" | null;

export type ResourceLinkType = "drive_folder" | "drive_file" | "web";

export type ResourceAppliesTo = "general" | "diseno" | "construccion" | "ambos";

export type ResourceStatus = "vigente" | "obsoleto";

export type ResourceTemplate = {
  key: string;
  title: string;
  section: ResourceSection;
  subsection: ResourceSubsection;
  linkType: ResourceLinkType;
  appliesTo: ResourceAppliesTo;
};

export type ResourceLink = {
  id: string;
  templateKey: string | null;
  title: string;
  section: ResourceSection;
  subsection: ResourceSubsection;
  linkType: ResourceLinkType;
  appliesTo: ResourceAppliesTo;
  url: string;
  status: ResourceStatus;
  owner: StaffRef | null;
  personalFor: StaffRef | null;
  sortOrder: number;
  /** Populated when the link was picked from the Drive browser. */
  drive: DriveFileMeta | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceLinkInput = {
  templateKey?: string | null;
  title: string;
  section: ResourceSection;
  subsection?: ResourceSubsection;
  linkType: ResourceLinkType;
  appliesTo?: ResourceAppliesTo;
  url: string;
  status?: ResourceStatus;
  ownerId?: string | null;
  personalForId?: string | null;
  sortOrder?: number;
  drive?: Omit<DriveFileMeta, "id"> | null;
};

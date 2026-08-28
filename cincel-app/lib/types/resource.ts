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

export type DriveFileMeta = {
  googleFileId: string;
  fileName: string;
  mimeType: string;
  iconLink: string | null;
  thumbnailLink: string | null;
  webViewLink: string;
  syncedAt: string;
};

export type ResourceLink = {
  id: string;
  templateKey: string;
  title: string;
  section: ResourceSection;
  subsection: ResourceSubsection;
  linkType: ResourceLinkType;
  appliesTo: ResourceAppliesTo;
  url: string;
  status: ResourceStatus;
  ownerTeamMemberId: number | null;
  personalForTeamMemberId: number | null;
  updatedAt: string;
  history: ResourceHistoryItem[];
  /** Populated when the link was picked from the Drive browser. */
  drive: DriveFileMeta | null;
};

export type ResourceHistoryItem = {
  id: string;
  at: string;
  action: "created" | "updated" | "status_changed";
  note: string;
};

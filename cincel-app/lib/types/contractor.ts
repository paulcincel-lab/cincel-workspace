export type ContractorStatus = "Activo" | "Pausado" | "Lista Negra (no deseado)" | "Sin actividad con nosotros" | "Prospecto" | "Inactivo" | string;

export type ContractorSeniority = "Excelente" | "Nivel Medio" | "Con detalles" | "Bajo" | "No trabajes con el" | string;

export type PriceLevel = "Gama Alta" | "Nivel Medio" | "Medio-Bajo" | "Bajo" | "No Trabajes con el" | string;

export interface Contractor {
  id: number;
  company?: string;
  provider: string;
  status: ContractorStatus;
  categories: string[];
  mainSpecialty: string;
  seniority: ContractorSeniority;
  priceLevel: PriceLevel;
  rating: number;
  webPage?: string;
  contact?: string;
  secondaryContacts?: string[];
  startDate?: string;
  comments?: string;
}

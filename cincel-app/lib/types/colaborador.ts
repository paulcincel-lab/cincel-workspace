export type ColaboradorRole = "Arquitecto" | "Diseñador" | "Ingeniero" | "Administrativo" | "Gestor de Proyecto" | string;
export type ColaboradorStatus = "Activo" | "Freelance" | "Pasantía" | "Inactivo" | string;
export type ColaboradorSeniority = "Excelente" | "Nivel Medio" | "Con detalles" | "Bajo" | "No trabajes con el" | string;
export type ColaboradorPriceLevel = "Gama Alta" | "Nivel Medio" | "Medio-Bajo" | "Bajo" | string;

export interface Colaborador {
  id: number;
  name: string;
  role: ColaboradorRole;
  status: ColaboradorStatus;
  department?: string;
  contact?: string;
  email?: string;
  skills?: string[];
  categories?: string[];
  seniority?: ColaboradorSeniority;
  priceLevel?: ColaboradorPriceLevel;
  secondaryContacts?: string[];
  availability?: "Disponible" | "Parcial" | "Ocupado" | string;
  rating: number;
  startDate?: string;
  comments?: string;
}

export type TiendaStatus = "Activa" | "Inactiva" | "Cerrada" | "Próximo Abierto" | string;
export type TiendaType = "Física" | "Online" | "Híbrida" | string;
export type TiendaPriceLevel = "Gama Alta" | "Nivel Medio" | "Medio-Bajo" | "Bajo" | string;

export interface Tienda {
  id: number;
  name: string;
  company?: string;
  status: TiendaStatus;
  type: TiendaType;
  mainSpecialty?: string;
  categories?: string[];
  location?: string;
  contact?: string;
  secondaryContacts?: string[];
  rating: number;
  priceLevel?: TiendaPriceLevel;
  startDate?: string;
  comments?: string;
  website?: string;
}

import type { ResourceSection } from "@/lib/types/resource";

// Company documents (Empresa → Book, Manual, Imagen, RFC, Políticas) are shared by everyone,
// so picking a staff member there means nothing.
export function showsPersonSelector(mode: "overview" | ResourceSection) {
  return mode !== "empresa";
}

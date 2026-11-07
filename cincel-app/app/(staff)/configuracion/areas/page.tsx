import { redirect } from "next/navigation";

/** Áreas were replaced by Puestos (ADR 0003); old links land on the new page. */
export default function ConfiguracionAreasPage() {
  redirect("/configuracion/puestos");
}

import { redirect } from "next/navigation";

/** `/ajustes` opens Apariencia (redesign FE §2.1). */
export default function AjustesPage() {
  redirect("/ajustes/apariencia");
}

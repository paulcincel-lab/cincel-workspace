import { redirect } from "next/navigation";

/** Workflows became "Tramos y fases". */
export default function ConfiguracionWorkflowsPage() {
  redirect("/configuracion/tramos");
}

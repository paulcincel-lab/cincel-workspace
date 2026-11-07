export type PersonasTab = "equipo" | "clientes" | "contratistas" | "proveedores";

export type PersonasTabsProps = { active: PersonasTab; counts: Record<PersonasTab, number> };

/**
 * Personas tabs as links with counts, keeping the style (redesign FE §3.6, §4.7).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function PersonasTabs(props: PersonasTabsProps) {
  void props;
  return null;
}

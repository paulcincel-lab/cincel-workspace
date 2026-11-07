"use client";

export type AjustesNavKey =
  | "perfil" | "apariencia" | "notificaciones" | "integraciones"
  | "general" | "tema" | "horario" | "tramos" | "puestos" | "estatus" | "permisos" | "monday" | "google";

export type AjustesNavProps = { active: AjustesNavKey; isAdmin: boolean };

/**
 * Ajustes sub-navigation (redesign FE §3.8, §4.8): Personal / Organización;
 * each Organización item only with the capability of its segment.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AjustesNav(props: AjustesNavProps) {
  void props;
  return null;
}

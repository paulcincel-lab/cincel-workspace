/** Where an imported project's link on the result screen goes: its Ficha, like the Ficha tab of `ProjectSectionNav`. */
export function importedProjectHref(projectId: string): string {
  return `/proyectos/${encodeURIComponent(projectId)}/ficha`;
}

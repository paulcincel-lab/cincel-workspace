/**
 * Barrel de repositorios – Sprint 11.2
 *
 * Punto único de importación para toda la capa de acceso a datos.
 * Los componentes de UI deben importar SOLO desde este módulo o
 * desde los repositorios individuales; nunca directamente de Supabase.
 */

export {
  getProjectsSnapshot,
  fetchProjects,
  saveProjects,
  PROJECTS_STORAGE_KEY,
  type Project,
} from "./projects-repository";

export {
  getTeamMembersSnapshot,
  fetchTeamMembers,
  saveTeamMembers,
  TEAM_MEMBERS_STORAGE_KEY,
  type TeamMember,
} from "./team-repository";

export {
  getActivitiesSnapshot,
  fetchActivities,
  saveActivities,
  saveActivity,
  activitiesStorageKey,
  type Task,
  type WorkflowType,
} from "./activities-repository";

export {
  getClientsSnapshot,
  fetchClients,
  saveClients,
  MANUAL_CLIENTS_STORAGE_KEY,
  type ManualClient,
} from "./clients-repository";

export {
  getContractorsSnapshot,
  fetchContractors,
  saveContractors,
  CONTRACTORS_STORAGE_KEY,
  getColaboradoresSnapshot,
  fetchColaboradores,
  saveColaboradores,
  COLABORADORES_STORAGE_KEY,
  getTiendasSnapshot,
  fetchTiendas,
  saveTiendas,
  TIENDAS_STORAGE_KEY,
  type Contractor,
  type Colaborador,
  type Tienda,
} from "./providers-repository";

export {
  fetchResourceLinks,
  saveResourceLinks,
  deleteResourceLink,
  type ResourceLink,
} from "./resources-repository";

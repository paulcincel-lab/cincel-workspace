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
  type Project,
} from "./projects-repository";

export {
  getTeamMembersSnapshot,
  fetchTeamMembers,
  saveTeamMembers,
  type TeamMember,
} from "./team-repository";

export {
  getActivitiesSnapshot,
  fetchActivities,
  saveActivities,
  saveActivity,
  type Task,
  type WorkflowType,
} from "./activities-repository";

export {
  getClientsSnapshot,
  fetchClients,
  saveClients,
  type ManualClient,
} from "./clients-repository";

export {
  getContractorsSnapshot,
  fetchContractors,
  saveContractors,
  getColaboradoresSnapshot,
  fetchColaboradores,
  saveColaboradores,
  getTiendasSnapshot,
  fetchTiendas,
  saveTiendas,
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

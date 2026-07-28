-- Sprint 11.1 - Indexes (idempotent)

-- clients
create index if not exists idx_clients_name on core.clients(name);
create index if not exists idx_clients_kind on core.clients(kind);

-- projects
create index if not exists idx_projects_name on core.projects(name);
create index if not exists idx_projects_stage on core.projects(stage);
create index if not exists idx_projects_active on core.projects(active);
create index if not exists idx_projects_client_id on core.projects(client_id);

-- activities
create index if not exists idx_activities_project_id on core.activities(project_id);
create index if not exists idx_activities_workflow on core.activities(workflow);
create index if not exists idx_activities_status on core.activities(status);
create index if not exists idx_activities_manager_member_id on core.activities(manager_member_id);
create index if not exists idx_activities_commitment_date on core.activities(commitment_date);
create index if not exists idx_activities_review_date on core.activities(review_date);
create index if not exists idx_activities_delivery_date on core.activities(delivery_date);
create index if not exists idx_activities_archived on core.activities(archived);

-- m2m and child tables
create index if not exists idx_project_members_project_id on core.project_members(project_id);
create index if not exists idx_project_members_member_id on core.project_members(team_member_id);
create index if not exists idx_activity_support_activity_id on core.activity_support_members(activity_id);
create index if not exists idx_activity_history_activity_id on core.activity_history(activity_id);
create index if not exists idx_activity_checklist_activity_id on core.activity_checklist_items(activity_id);

-- providers
create index if not exists idx_contractors_provider on core.contractors(provider);
create index if not exists idx_contractors_status on core.contractors(status);
create index if not exists idx_collaborator_providers_name on core.collaborator_providers(name);
create index if not exists idx_collaborator_providers_status on core.collaborator_providers(status);
create index if not exists idx_stores_name on core.stores(name);
create index if not exists idx_stores_status on core.stores(status);

-- soft delete helper indexes
create index if not exists idx_clients_deleted_at on core.clients(deleted_at);
create index if not exists idx_projects_deleted_at on core.projects(deleted_at);
create index if not exists idx_activities_deleted_at on core.activities(deleted_at);
create index if not exists idx_team_members_deleted_at on core.team_members(deleted_at);
create index if not exists idx_contractors_deleted_at on core.contractors(deleted_at);
create index if not exists idx_collaborator_providers_deleted_at on core.collaborator_providers(deleted_at);
create index if not exists idx_stores_deleted_at on core.stores(deleted_at);

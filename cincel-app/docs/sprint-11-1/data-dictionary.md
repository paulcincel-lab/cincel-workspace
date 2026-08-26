# Diccionario de datos Sprint 11.1

## Convenciones
- PK: UUID (`id`) en todas las tablas.
- Campo de trazabilidad: `legacy_id` BIGINT para mapear IDs actuales de localStorage.
- Tiempos tecnicos: `created_at`, `updated_at`, `deleted_at` (soft delete).
- No se cambia logica de negocio de Cincel en este sprint.

## Tablas principales

### clients
Representa clientes de Proyectos y clientes manuales del modulo Clientes.
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- name (text, not null)
- kind (text, not null) valores esperados: Empresa | Particular
- phone (text)
- acquisition_channel (text)
- total_spent_mxn (numeric(14,2), default 0)
- total_projects_worked (int, default 0)
- first_work_date (date)
- has_active_project (boolean, default false)
- active_project_name (text)
- active_project_type (text)
- created_at, updated_at, deleted_at

### client_contacts
Contactos secundarios de cliente.
- id (uuid, pk)
- client_id (uuid, fk -> clients.id)
- name, role, phone, email (text)
- sort_order (int)
- created_at, updated_at, deleted_at

### team_members
Equipo Cincel (antes teamMembers en localStorage).
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- name, role, area (text, not null en name)
- active (boolean, default true)
- capacity (int, default 0)
- availability (text)
- institutional_email, personal_email (text)
- birth_date, nationality, phone, address, marital_status, home_phone, curp, rfc (text)
- emergency_contact (jsonb)
- auth (jsonb)
- created_at, updated_at, deleted_at

### projects
Proyecto operativo principal.
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- code (text, uk)
- name (text, not null)
- status (text)
- active (boolean, default true)
- client_id (uuid, fk -> clients.id)
- project_type, stage, phase (text)
- manager_name, coordinator_name (text)
- progress (int default 0)
- start_date (date)
- address_street, address_city, address_state (text)
- created_at, updated_at, deleted_at

### project_drive_links
Links de drive por proyecto.
- id (uuid, pk)
- project_id (uuid, fk -> projects.id)
- administrativo_url, planos_url, renders_url, reportes_url (text)
- created_at, updated_at, deleted_at

### project_members
Miembros asociados al proyecto (array `team` actual).
- id (uuid, pk)
- project_id (uuid, fk -> projects.id)
- team_member_id (uuid, fk -> team_members.id)
- member_name_snapshot (text)
- created_at, updated_at, deleted_at

### activities
Actividades unificadas (Presale, Diseno, Construccion).
- id (uuid, pk)
- legacy_id (bigint, nullable)
- project_id (uuid, fk -> projects.id)
- project_name_snapshot (text)
- workflow (text): Presale | Diseno | Construccion
- phase, description, notes (text)
- manager_member_id (uuid, fk -> team_members.id, nullable)
- manager_name_snapshot (text)
- status (text): Pendiente | En proceso | Completado | Bloqueado
- priority (text): Alta | Media | Baja
- commitment_date, review_date, delivery_date (date)
- archived (boolean, default false)
- created_at_label, updated_at_label (text) para preservar etiquetas tipo "Hoy"
- created_on, updated_on (date) para fecha normalizada
- created_at, updated_at, deleted_at

### activity_support_members
Soportes de actividad (array `support` actual).
- id (uuid, pk)
- activity_id (uuid, fk -> activities.id)
- team_member_id (uuid, fk -> team_members.id, nullable)
- support_name_snapshot (text)
- created_at, updated_at, deleted_at

### activity_history
Bitacora de actividad (`history`).
- id (uuid, pk)
- activity_id (uuid, fk -> activities.id)
- legacy_id (bigint, nullable)
- author_member_id (uuid, fk -> team_members.id, nullable)
- author_name_snapshot (text)
- event_date (date)
- comment (text)
- created_at, updated_at, deleted_at

### activity_checklist_items
Checklist de actividad.
- id (uuid, pk)
- activity_id (uuid, fk -> activities.id)
- legacy_id (bigint, nullable)
- title (text)
- completed (boolean, default false)
- sort_order (int, default 0)
- created_at, updated_at, deleted_at

### contractors
Proveedores contratistas.
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- provider (text, not null)
- company, status, main_specialty, seniority, price_level (text)
- rating (int)
- web_page, contact, comments (text)
- start_date (date)
- created_at, updated_at, deleted_at

### contractor_categories
Categorias multivalor de contratistas.
- id (uuid, pk)
- contractor_id (uuid, fk -> contractors.id)
- category (text)
- sort_order (int)
- created_at, updated_at, deleted_at

### collaborator_providers
Proveedores colaboradores (modulo proveedores/colaboradores).
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- name, role, status (text)
- department, contact, email (text)
- seniority, price_level, availability (text)
- rating (int)
- start_date (date)
- comments (text)
- created_at, updated_at, deleted_at

### collaborator_categories
Categorias de colaboradores proveedores.
- id (uuid, pk)
- collaborator_id (uuid, fk -> collaborator_providers.id)
- category (text)
- sort_order (int)
- created_at, updated_at, deleted_at

### collaborator_skills
Skills multivalor de colaboradores proveedores.
- id (uuid, pk)
- collaborator_id (uuid, fk -> collaborator_providers.id)
- skill (text)
- sort_order (int)
- created_at, updated_at, deleted_at

### stores
Proveedores tiendas.
- id (uuid, pk)
- legacy_id (bigint, uk, nullable)
- name (text, not null)
- company, status, store_type, main_specialty (text)
- location, contact, comments, website (text)
- rating (int)
- price_level (text)
- start_date (date)
- created_at, updated_at, deleted_at

### store_categories
Categorias multivalor de tiendas.
- id (uuid, pk)
- store_id (uuid, fk -> stores.id)
- category (text)
- sort_order (int)
- created_at, updated_at, deleted_at

### resource_links
Links de recursos por plantilla y sección (módulo Recursos). Agregado en Sprint 11.2.

> **Excepción de PK:** `id` es `text primary key` en lugar de `uuid`. Los IDs son claves naturales estables generadas por la aplicación a partir de la plantilla que los origina (p. ej. `"documentos_mis_documentos"`, `"personal_mis_documentos_<legacyId>"`). Esto permite hacer `upsert({ onConflict: "id" })` de forma idempotente sin necesidad de consultar primero la base de datos. Ver `docs/sprint-11-1/integrity-rules.md` §Recursos para la justificación completa.

- id (text, pk) — clave natural generada por la app
- template_key (text, not null) — identificador de la plantilla que originó el registro
- title (text, not null) — título visible del link
- section (text, not null) — sección del módulo; valores permitidos: `mis-documentos`, `mis-favoritos`, `plantillas-diseno`, `formatos-obra`, `mis-vacaciones`, `formacion`, `empresa`
- subsection (text, nullable) — subsección opcional; valores permitidos: `diseno`, `construccion`
- link_type (text, not null) — tipo de enlace; valores permitidos: `drive_folder`, `drive_file`, `web`
- applies_to (text, not null) — ámbito de aplicación; valores permitidos: `general`, `diseno`, `construccion`, `ambos`
- url (text, not null) — URL del recurso
- status (text, not null, default `'vigente'`) — valores permitidos: `vigente`, `obsoleto`
- owner_team_member_legacy_id (bigint, nullable) — legacy_id del miembro propietario del recurso
- personal_for_team_member_legacy_id (bigint, nullable) — legacy_id del miembro cuando el recurso es personal
- updated_at_label (text, nullable) — etiqueta legible de última actualización (p. ej. "Hoy")
- history (jsonb, not null, default `'[]'`) — bitácora de cambios del link
- created_at, updated_at, deleted_at

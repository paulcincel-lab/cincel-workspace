CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TYPE "core"."contact_kind" AS ENUM('empresa', 'particular');--> statement-breakpoint
CREATE TYPE "core"."contact_type" AS ENUM('cliente', 'socio', 'proveedor');--> statement-breakpoint
CREATE TYPE "core"."history_entity" AS ENUM('task', 'project', 'contact', 'resource_link', 'staff', 'area', 'workflow');--> statement-breakpoint
CREATE TYPE "core"."history_event_kind" AS ENUM('comentario', 'cambio');--> statement-breakpoint
CREATE TYPE "core"."project_status" AS ENUM('activo', 'pausado', 'completado', 'cancelado');--> statement-breakpoint
CREATE TYPE "core"."provider_status" AS ENUM('activo', 'inactivo', 'pausado', 'prospecto', 'lista_negra');--> statement-breakpoint
CREATE TYPE "core"."provider_subtype" AS ENUM('contratista', 'colaborador', 'tienda');--> statement-breakpoint
CREATE TYPE "core"."staff_kind" AS ENUM('empleado', 'freelance', 'servicio_social');--> statement-breakpoint
CREATE TYPE "core"."task_kind" AS ENUM('workflow', 'usuario');--> statement-breakpoint
CREATE TYPE "core"."task_priority" AS ENUM('alta', 'media', 'baja');--> statement-breakpoint
CREATE TYPE "core"."task_status" AS ENUM('pendiente', 'en_proceso', 'completado', 'bloqueado');--> statement-breakpoint
CREATE TABLE "core"."area_members" (
	"area_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_members_area_id_staff_id_pk" PRIMARY KEY("area_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "core"."areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "core"."staff_kind" DEFAULT 'empleado' NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" text,
	"capacity" integer DEFAULT 0 NOT NULL,
	"availability" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "staff_capacity_check" CHECK ("core"."staff"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."staff_profiles" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"personal_email" text,
	"home_phone" text,
	"nationality" text,
	"address" text,
	"marital_status" text,
	"birth_date" date,
	"curp" text,
	"rfc" text,
	"emergency_contact_name" text,
	"emergency_contact_relation" text,
	"emergency_contact_phone" text,
	"emergency_contact_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."contact_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."contact_tags" (
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contact_tags_contact_id_kind_value_pk" PRIMARY KEY("contact_id","kind","value"),
	CONSTRAINT "contact_tags_kind_check" CHECK ("core"."contact_tags"."kind" in ('categoria', 'habilidad'))
);
--> statement-breakpoint
CREATE TABLE "core"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "core"."contact_type" NOT NULL,
	"kind" "core"."contact_kind" DEFAULT 'empresa' NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"location" text,
	"acquisition_channel" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contacts_id_type_uq" UNIQUE("id","type")
);
--> statement-breakpoint
CREATE TABLE "core"."provider_profiles" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"contact_type" "core"."contact_type" GENERATED ALWAYS AS ('proveedor'::core.contact_type) STORED NOT NULL,
	"subtype" "core"."provider_subtype" NOT NULL,
	"status" "core"."provider_status",
	"main_specialty" text,
	"department" text,
	"seniority" text,
	"price_level" text,
	"availability" text,
	"comments" text,
	"rating" integer,
	"start_date" date,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_profiles_rating_check" CHECK ("core"."provider_profiles"."rating" is null or "core"."provider_profiles"."rating" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "core"."area_workflows" (
	"area_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_workflows_area_id_workflow_id_pk" PRIMARY KEY("area_id","workflow_id")
);
--> statement-breakpoint
CREATE TABLE "core"."workflow_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"phase" text,
	"title" text NOT NULL,
	"notes" text,
	"default_priority" "core"."task_priority" DEFAULT 'media' NOT NULL,
	"commitment_offset_days" integer,
	"review_offset_days" integer,
	"delivery_offset_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_task_templates_id_workflow_uq" UNIQUE("id","workflow_id")
);
--> statement-breakpoint
CREATE TABLE "core"."workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."drive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_file_id" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"icon_link" text,
	"thumbnail_link" text,
	"web_view_link" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_files_google_file_id_unique" UNIQUE("google_file_id")
);
--> statement-breakpoint
CREATE TABLE "core"."history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" "core"."history_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "core"."history_event_kind" NOT NULL,
	"actor_id" uuid,
	"field" text,
	"before_value" text,
	"after_value" text,
	"comment" text,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_events_shape_check" CHECK (("core"."history_events"."kind" = 'comentario' and "core"."history_events"."comment" is not null and "core"."history_events"."field" is null) or ("core"."history_events"."kind" = 'cambio' and "core"."history_events"."field" is not null and "core"."history_events"."comment" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."legacy_refs" (
	"entity" text NOT NULL,
	"legacy_id" bigint NOT NULL,
	"row_id" uuid NOT NULL,
	CONSTRAINT "legacy_refs_entity_legacy_id_pk" PRIMARY KEY("entity","legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."resource_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"subsection" text,
	"link_type" text NOT NULL,
	"applies_to" text DEFAULT 'general' NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"owner_id" uuid,
	"personal_for_id" uuid,
	"drive_file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "resource_links_section_check" CHECK ("core"."resource_links"."section" in ('mis-documentos', 'mis-favoritos', 'plantillas-diseno', 'formatos-obra', 'mis-vacaciones', 'formacion', 'empresa')),
	CONSTRAINT "resource_links_subsection_check" CHECK ("core"."resource_links"."subsection" is null or "core"."resource_links"."subsection" in ('diseno', 'construccion')),
	CONSTRAINT "resource_links_link_type_check" CHECK ("core"."resource_links"."link_type" in ('drive_folder', 'drive_file', 'web')),
	CONSTRAINT "resource_links_applies_to_check" CHECK ("core"."resource_links"."applies_to" in ('general', 'diseno', 'construccion', 'ambos')),
	CONSTRAINT "resource_links_status_check" CHECK ("core"."resource_links"."status" in ('vigente', 'obsoleto'))
);
--> statement-breakpoint
CREATE TABLE "core"."project_contacts" (
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_contacts_project_id_contact_id_pk" PRIMARY KEY("project_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "core"."project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"url" text NOT NULL,
	"drive_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_links_project_kind_uq" UNIQUE("project_id","kind")
);
--> statement-breakpoint
CREATE TABLE "core"."project_members" (
	"project_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_staff_id_pk" PRIMARY KEY("project_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "core"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"client_type" "core"."contact_type" GENERATED ALWAYS AS ('cliente'::core.contact_type) STORED NOT NULL,
	"status" "core"."project_status" DEFAULT 'activo' NOT NULL,
	"current_workflow_id" uuid,
	"phase" text,
	"project_type" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"manager_id" uuid,
	"coordinator_id" uuid,
	"progress" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"contract_amount_mxn" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_progress_check" CHECK ("core"."projects"."progress" between 0 and 100),
	CONSTRAINT "projects_dates_check" CHECK ("core"."projects"."start_date" is null or "core"."projects"."end_date" is null or "core"."projects"."end_date" >= "core"."projects"."start_date")
);
--> statement-breakpoint
CREATE TABLE "core"."task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."task_support" (
	"task_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_support_task_id_staff_id_pk" PRIMARY KEY("task_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "core"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "core"."task_kind" NOT NULL,
	"template_id" uuid,
	"workflow_id" uuid,
	"phase" text,
	"title" text NOT NULL,
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"manager_id" uuid,
	"status" "core"."task_status" DEFAULT 'pendiente' NOT NULL,
	"priority" "core"."task_priority" DEFAULT 'media' NOT NULL,
	"commitment_date" date,
	"review_date" date,
	"delivery_date" date,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_kind_check" CHECK (("core"."tasks"."kind" = 'workflow' and "core"."tasks"."template_id" is not null and "core"."tasks"."workflow_id" is not null) or ("core"."tasks"."kind" = 'usuario' and "core"."tasks"."template_id" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."auth_credentials" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"salt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"password_updated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"staff_id" uuid NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "core"."area_members" ADD CONSTRAINT "area_members_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "core"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."area_members" ADD CONSTRAINT "area_members_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."areas" ADD CONSTRAINT "areas_lead_id_staff_id_fk" FOREIGN KEY ("lead_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."staff_profiles" ADD CONSTRAINT "staff_profiles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contact_people" ADD CONSTRAINT "contact_people_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "core"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "core"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."provider_profiles" ADD CONSTRAINT "provider_profiles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."provider_profiles" ADD CONSTRAINT "provider_profiles_contact_fk" FOREIGN KEY ("contact_id","contact_type") REFERENCES "core"."contacts"("id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."area_workflows" ADD CONSTRAINT "area_workflows_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "core"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."area_workflows" ADD CONSTRAINT "area_workflows_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" ADD CONSTRAINT "workflow_task_templates_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."history_events" ADD CONSTRAINT "history_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_personal_for_id_staff_id_fk" FOREIGN KEY ("personal_for_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."resource_links" ADD CONSTRAINT "resource_links_drive_file_id_drive_files_id_fk" FOREIGN KEY ("drive_file_id") REFERENCES "core"."drive_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_contacts" ADD CONSTRAINT "project_contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_contacts" ADD CONSTRAINT "project_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "core"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_links" ADD CONSTRAINT "project_links_drive_file_id_drive_files_id_fk" FOREIGN KEY ("drive_file_id") REFERENCES "core"."drive_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_members" ADD CONSTRAINT "project_members_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_current_workflow_id_workflows_id_fk" FOREIGN KEY ("current_workflow_id") REFERENCES "core"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_manager_id_staff_id_fk" FOREIGN KEY ("manager_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_coordinator_id_staff_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_client_fk" FOREIGN KEY ("client_id","client_type") REFERENCES "core"."contacts"("id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."task_support" ADD CONSTRAINT "task_support_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "core"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."task_support" ADD CONSTRAINT "task_support_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "core"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_manager_id_staff_id_fk" FOREIGN KEY ("manager_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_template_fk" FOREIGN KEY ("template_id","workflow_id") REFERENCES "core"."workflow_task_templates"("id","workflow_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."auth_credentials" ADD CONSTRAINT "auth_credentials_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_area_members_staff_id" ON "core"."area_members" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "areas_name_lower_uq" ON "core"."areas" USING btree (lower("name")) WHERE "core"."areas"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_name_lower_uq" ON "core"."staff" USING btree (lower("name")) WHERE "core"."staff"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_lower_uq" ON "core"."staff" USING btree (lower("email")) WHERE "core"."staff"."deleted_at" is null and "core"."staff"."email" is not null;--> statement-breakpoint
CREATE INDEX "idx_staff_name_trgm" ON "core"."staff" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_staff_active" ON "core"."staff" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_curp_uq" ON "core"."staff_profiles" USING btree ("curp") WHERE "core"."staff_profiles"."curp" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_rfc_uq" ON "core"."staff_profiles" USING btree ("rfc") WHERE "core"."staff_profiles"."rfc" is not null;--> statement-breakpoint
CREATE INDEX "idx_contact_people_contact_id" ON "core"."contact_people" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_people_primary_uq" ON "core"."contact_people" USING btree ("contact_id") WHERE "core"."contact_people"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_type_name_lower_uq" ON "core"."contacts" USING btree ("type",lower("name")) WHERE "core"."contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_contacts_name_trgm" ON "core"."contacts" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_contacts_type" ON "core"."contacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_provider_profiles_subtype" ON "core"."provider_profiles" USING btree ("subtype");--> statement-breakpoint
CREATE INDEX "idx_provider_profiles_status" ON "core"."provider_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_provider_profiles_staff_id" ON "core"."provider_profiles" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_area_workflows_workflow_id" ON "core"."area_workflows" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_task_templates_title_lower_uq" ON "core"."workflow_task_templates" USING btree ("workflow_id",lower("title")) WHERE "core"."workflow_task_templates"."active" = true;--> statement-breakpoint
CREATE INDEX "idx_workflow_task_templates_order" ON "core"."workflow_task_templates" USING btree ("workflow_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_key_uq" ON "core"."workflows" USING btree ("key") WHERE "core"."workflows"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_history_events_entity" ON "core"."history_events" USING btree ("entity","entity_id","event_at");--> statement-breakpoint
CREATE INDEX "idx_history_events_actor_id" ON "core"."history_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_legacy_refs_row_id" ON "core"."legacy_refs" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "idx_resource_links_section" ON "core"."resource_links" USING btree ("section","subsection");--> statement-breakpoint
CREATE INDEX "idx_resource_links_status" ON "core"."resource_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_resource_links_owner_id" ON "core"."resource_links" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_resource_links_personal_for_id" ON "core"."resource_links" USING btree ("personal_for_id");--> statement-breakpoint
CREATE INDEX "idx_project_contacts_contact_id" ON "core"."project_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_project_members_staff_id" ON "core"."project_members" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_uq" ON "core"."projects" USING btree ("code") WHERE "core"."projects"."deleted_at" is null and "core"."projects"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_client_name_lower_uq" ON "core"."projects" USING btree ("client_id",lower("name")) WHERE "core"."projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_projects_name_trgm" ON "core"."projects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_client_id" ON "core"."projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_projects_manager_id" ON "core"."projects" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "core"."projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_projects_current_workflow_id" ON "core"."projects" USING btree ("current_workflow_id");--> statement-breakpoint
CREATE INDEX "idx_task_checklist_items_task_id" ON "core"."task_checklist_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_support_staff_id" ON "core"."task_support" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_template_uq" ON "core"."tasks" USING btree ("project_id","template_id") WHERE "core"."tasks"."template_id" is not null and "core"."tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_tasks_project_id" ON "core"."tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_manager_id" ON "core"."tasks" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_created_by_id" ON "core"."tasks" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_workflow_id" ON "core"."tasks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "core"."tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_commitment_date" ON "core"."tasks" USING btree ("commitment_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_review_date" ON "core"."tasks" USING btree ("review_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_delivery_date" ON "core"."tasks" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_title_trgm" ON "core"."tasks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tasks_hot" ON "core"."tasks" USING btree ("status","commitment_date") WHERE "core"."tasks"."deleted_at" is null and "core"."tasks"."archived" = false;--> statement-breakpoint
CREATE INDEX "idx_sessions_staff_id" ON "core"."sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "core"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE VIEW "core"."client_stats" AS (select "client_id", count(*)::int as "total_projects", count(*) filter (where "status" = 'activo')::int as "active_projects", min("start_date") as "first_work_date", coalesce(sum("contract_amount_mxn"), 0) as "total_contracted_mxn" from "core"."projects" where "core"."projects"."deleted_at" is null group by "core"."projects"."client_id");
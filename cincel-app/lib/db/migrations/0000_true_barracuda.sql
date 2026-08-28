CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TYPE "core"."client_kind" AS ENUM('Empresa', 'Particular');--> statement-breakpoint
CREATE TYPE "core"."task_priority" AS ENUM('Alta', 'Media', 'Baja');--> statement-breakpoint
CREATE TYPE "core"."task_status" AS ENUM('Pendiente', 'En proceso', 'Completado', 'Bloqueado');--> statement-breakpoint
CREATE TYPE "core"."workflow_type" AS ENUM('Presale', 'Diseno', 'Construccion');--> statement-breakpoint
CREATE TABLE "core"."activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"project_id" uuid,
	"project_name_snapshot" text,
	"workflow" "core"."workflow_type" NOT NULL,
	"phase" text,
	"description" text NOT NULL,
	"notes" text,
	"manager_member_id" uuid,
	"manager_name_snapshot" text,
	"status" "core"."task_status" NOT NULL,
	"priority" "core"."task_priority" NOT NULL,
	"commitment_date" date,
	"review_date" date,
	"delivery_date" date,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at_label" text,
	"updated_at_label" text,
	"created_on" date,
	"updated_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "activities_review_after_commitment" CHECK ("core"."activities"."review_date" is null or "core"."activities"."commitment_date" is null or "core"."activities"."review_date" >= "core"."activities"."commitment_date"),
	CONSTRAINT "activities_delivery_after_commitment" CHECK ("core"."activities"."delivery_date" is null or "core"."activities"."commitment_date" is null or "core"."activities"."delivery_date" >= "core"."activities"."commitment_date")
);
--> statement-breakpoint
CREATE TABLE "core"."activity_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"legacy_id" bigint,
	"title" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."activity_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"legacy_id" bigint,
	"author_member_id" uuid,
	"author_name_snapshot" text,
	"event_date" date,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."activity_support_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"team_member_id" uuid,
	"support_name_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "activity_support_members_activity_id_team_member_id_support_name_snapshot_unique" UNIQUE("activity_id","team_member_id","support_name_snapshot")
);
--> statement-breakpoint
CREATE TABLE "core"."auth_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"salt" text NOT NULL,
	"auth_enabled" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"password_updated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "auth_credentials_team_member_id_unique" UNIQUE("team_member_id")
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"team_member_id" uuid NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "core"."client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"name" text NOT NULL,
	"kind" "core"."client_kind" DEFAULT 'Particular' NOT NULL,
	"phone" text,
	"acquisition_channel" text,
	"total_spent_mxn" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_projects_worked" integer DEFAULT 0 NOT NULL,
	"first_work_date" date,
	"has_active_project" boolean DEFAULT false NOT NULL,
	"active_project_name" text,
	"active_project_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "clients_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"name" text NOT NULL,
	"birth_date" text,
	"nationality" text,
	"phone" text,
	"institutional_email" text,
	"address" text,
	"marital_status" text,
	"home_phone" text,
	"personal_email" text,
	"curp" text,
	"rfc" text,
	"emergency_contact" jsonb,
	"role" text,
	"area" text,
	"capacity" integer DEFAULT 0 NOT NULL,
	"availability" text,
	"active" boolean DEFAULT true NOT NULL,
	"auth" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "team_members_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."project_drive_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"administrativo_url" text,
	"planos_url" text,
	"renders_url" text,
	"reportes_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "project_drive_links_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "core"."project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"team_member_id" uuid,
	"member_name_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "project_members_project_id_team_member_id_unique" UNIQUE("project_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "core"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"code" text,
	"name" text NOT NULL,
	"status" text,
	"active" boolean DEFAULT true NOT NULL,
	"client_id" uuid,
	"project_type" text,
	"stage" text,
	"phase" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"manager_name" text,
	"coordinator_name" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "projects_code_unique" UNIQUE("code"),
	CONSTRAINT "projects_progress_range" CHECK ("core"."projects"."progress" >= 0 and "core"."projects"."progress" <= 100)
);
--> statement-breakpoint
CREATE TABLE "core"."collaborator_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."collaborator_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"name" text NOT NULL,
	"role" text,
	"status" text,
	"department" text,
	"contact" text,
	"email" text,
	"seniority" text,
	"price_level" text,
	"availability" text,
	"rating" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "collaborator_providers_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."collaborator_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."contractor_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contractor_id" uuid NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"company" text,
	"provider" text NOT NULL,
	"status" text,
	"main_specialty" text,
	"seniority" text,
	"price_level" text,
	"rating" integer DEFAULT 0 NOT NULL,
	"web_page" text,
	"contact" text,
	"start_date" date,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contractors_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."store_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" bigint,
	"name" text NOT NULL,
	"company" text,
	"status" text,
	"store_type" text,
	"main_specialty" text,
	"location" text,
	"contact" text,
	"rating" integer DEFAULT 0 NOT NULL,
	"price_level" text,
	"start_date" date,
	"comments" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stores_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "core"."resource_links" (
	"id" text PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"subsection" text,
	"link_type" text NOT NULL,
	"applies_to" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"owner_team_member_legacy_id" bigint,
	"personal_for_team_member_legacy_id" bigint,
	"updated_at_label" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
ALTER TABLE "core"."activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activities" ADD CONSTRAINT "activities_manager_member_id_team_members_id_fk" FOREIGN KEY ("manager_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activity_checklist_items" ADD CONSTRAINT "activity_checklist_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "core"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activity_history" ADD CONSTRAINT "activity_history_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "core"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activity_history" ADD CONSTRAINT "activity_history_author_member_id_team_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activity_support_members" ADD CONSTRAINT "activity_support_members_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "core"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."activity_support_members" ADD CONSTRAINT "activity_support_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."auth_credentials" ADD CONSTRAINT "auth_credentials_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_drive_links" ADD CONSTRAINT "project_drive_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_members" ADD CONSTRAINT "project_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "core"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "core"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."collaborator_categories" ADD CONSTRAINT "collaborator_categories_collaborator_id_collaborator_providers_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "core"."collaborator_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."collaborator_skills" ADD CONSTRAINT "collaborator_skills_collaborator_id_collaborator_providers_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "core"."collaborator_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."contractor_categories" ADD CONSTRAINT "contractor_categories_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "core"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."store_categories" ADD CONSTRAINT "store_categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "core"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_project_id" ON "core"."activities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_activities_workflow" ON "core"."activities" USING btree ("workflow");--> statement-breakpoint
CREATE INDEX "idx_activities_status" ON "core"."activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_activities_manager_member_id" ON "core"."activities" USING btree ("manager_member_id");--> statement-breakpoint
CREATE INDEX "idx_activities_commitment_date" ON "core"."activities" USING btree ("commitment_date");--> statement-breakpoint
CREATE INDEX "idx_activities_review_date" ON "core"."activities" USING btree ("review_date");--> statement-breakpoint
CREATE INDEX "idx_activities_delivery_date" ON "core"."activities" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "idx_activities_archived" ON "core"."activities" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "idx_activities_deleted_at" ON "core"."activities" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_activity_checklist_activity_id" ON "core"."activity_checklist_items" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_history_activity_id" ON "core"."activity_history" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_support_activity_id" ON "core"."activity_support_members" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_clients_name" ON "core"."clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_clients_kind" ON "core"."clients" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_clients_deleted_at" ON "core"."clients" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_team_members_deleted_at" ON "core"."team_members" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_project_members_project_id" ON "core"."project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_members_member_id" ON "core"."project_members" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "idx_projects_name" ON "core"."projects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_projects_stage" ON "core"."projects" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_projects_active" ON "core"."projects" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_projects_client_id" ON "core"."projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_projects_deleted_at" ON "core"."projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_collaborator_providers_name" ON "core"."collaborator_providers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_collaborator_providers_status" ON "core"."collaborator_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_collaborator_providers_deleted_at" ON "core"."collaborator_providers" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_contractors_provider" ON "core"."contractors" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_contractors_status" ON "core"."contractors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contractors_deleted_at" ON "core"."contractors" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_stores_name" ON "core"."stores" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_stores_status" ON "core"."stores" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stores_deleted_at" ON "core"."stores" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_resource_links_section" ON "core"."resource_links" USING btree ("section");--> statement-breakpoint
CREATE INDEX "idx_resource_links_subsection" ON "core"."resource_links" USING btree ("subsection");--> statement-breakpoint
CREATE INDEX "idx_resource_links_status" ON "core"."resource_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_resource_links_owner_team_member_legacy_id" ON "core"."resource_links" USING btree ("owner_team_member_legacy_id");--> statement-breakpoint
CREATE INDEX "idx_resource_links_personal_for_team_member_legacy_id" ON "core"."resource_links" USING btree ("personal_for_team_member_legacy_id");--> statement-breakpoint
CREATE INDEX "idx_resource_links_deleted_at" ON "core"."resource_links" USING btree ("deleted_at");
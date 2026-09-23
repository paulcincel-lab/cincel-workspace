-- Retire the Decoración department (#437 follow-up). Deactivate rather than
-- delete: existing tasks, history and any project that reached that stage keep
-- their data, and workflow/area lists already hide inactive rows. Reversible by
-- setting `active = true` again.
UPDATE "core"."workflows" SET "active" = false, "updated_at" = now() WHERE "key" = 'decoracion' AND "deleted_at" IS NULL;
--> statement-breakpoint
UPDATE "core"."areas" SET "active" = false, "updated_at" = now() WHERE lower("name") = lower('Decoración') AND "deleted_at" IS NULL;

ALTER TABLE "core"."areas" ADD COLUMN "color_slot" integer;--> statement-breakpoint
ALTER TABLE "core"."areas" ADD CONSTRAINT "areas_color_slot_check" CHECK ("core"."areas"."color_slot" between 1 and 5);--> statement-breakpoint
-- Backfill: the known departments get their fixed slot, every other área takes
-- the next free slot (by sort order), and the rest stay neutral (null).
UPDATE "core"."areas" SET "color_slot" = CASE translate(lower(trim("name")), 'áéíóúñ', 'aeioun')
  WHEN 'presale' THEN 1
  WHEN 'diseno' THEN 2
  WHEN 'construccion' THEN 3
  WHEN 'decoracion' THEN 4
END
WHERE "deleted_at" IS NULL;--> statement-breakpoint
DO $$
DECLARE
  a record;
  free_slot integer;
BEGIN
  FOR a IN
    SELECT "id" FROM "core"."areas"
    WHERE "deleted_at" IS NULL AND "color_slot" IS NULL
    ORDER BY "sort_order", "name"
  LOOP
    SELECT s INTO free_slot FROM generate_series(1, 5) AS s
    WHERE NOT EXISTS (
      SELECT 1 FROM "core"."areas" x
      WHERE x."deleted_at" IS NULL AND x."color_slot" = s
    )
    ORDER BY s LIMIT 1;
    EXIT WHEN free_slot IS NULL;
    UPDATE "core"."areas" SET "color_slot" = free_slot WHERE "id" = a."id";
  END LOOP;
END $$;

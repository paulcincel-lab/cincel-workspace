-- New users start in light mode so the first paint matches the Azul Cincel canvas. Existing rows keep their mode.
ALTER TABLE "core"."user_preferences" ALTER COLUMN "mode" SET DEFAULT 'light';

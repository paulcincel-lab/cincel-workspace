-- Inicio reads status changes by (entity, field, event_at) across all rows of an entity; the
-- (entity, entity_id, event_at) index cannot serve that range, so the feed gets its own partial index.
CREATE INDEX IF NOT EXISTS "idx_history_events_change_feed" ON "core"."history_events" USING btree ("entity","field","event_at") WHERE "core"."history_events"."kind" = 'cambio';

-- The legacy appearance pipeline is gone (redesign BE §3.12, §16 D2): appearance.theme is the only
-- appearance source. A no-op when the key is absent.
DELETE FROM core.app_settings WHERE key = 'appearance.primary_color';

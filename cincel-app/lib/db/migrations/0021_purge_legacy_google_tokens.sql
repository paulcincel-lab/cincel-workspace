-- Staff SSO cleanup (BE §A.8 step 5): legacy token rows from the old connect-any-account flow have no google_sub.
-- Nothing reads them after the delegation and old OAuth routes were removed; rows with google_sub are kept.
DELETE FROM "core"."google_oauth_accounts" WHERE "google_sub" IS NULL;

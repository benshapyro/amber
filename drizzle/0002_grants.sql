-- What the app role may touch. Owner tables get no DELETE: deletes are
-- soft (deleted_at), so a photo can always be recovered within 30 days.
GRANT USAGE ON SCHEMA public TO amber_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "moments", "media", "activity_log", "geocode_cache" TO amber_app;--> statement-breakpoint
-- Auth tables are not owner-scoped: a session or API key has to be looked
-- up before anyone knows which user is asking. Better Auth needs DELETE
-- for expired sessions, used magic links, and revoked keys.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification", "passkey", "apikey" TO amber_app;

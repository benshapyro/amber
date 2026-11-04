-- The activity log is a record of who did what, so the app may add to it
-- and read it, never rewrite it.
REVOKE UPDATE ON "activity_log" FROM amber_app;

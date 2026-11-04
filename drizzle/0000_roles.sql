-- The restricted role the app connects as. It does not own any table and
-- cannot bypass row-level security, so RLS policies always apply to it.
-- Login and password are set outside migrations: `pnpm db:app-role`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amber_app') THEN
    CREATE ROLE amber_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

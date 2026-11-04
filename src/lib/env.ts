// One place that reads process.env, so a missing variable fails loudly
// with its name instead of as an undefined deep inside a library.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  },
  get allowedEmail() {
    return required("ALLOWED_EMAIL").trim().toLowerCase();
  },
  get r2() {
    return {
      endpoint: required("R2_ENDPOINT"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
    };
  },
  get resendKey() {
    return process.env.RESEND_API_KEY;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Amber <amber@shapyro.com>";
  },
  get mapboxToken() {
    return process.env.MAPBOX_TOKEN;
  },
  // "trigger" sends processing to Trigger.dev; "inline" runs it in the
  // request (local development and tests, where there is no worker).
  get jobsMode(): "trigger" | "inline" {
    return process.env.JOBS_MODE === "inline" ? "inline" : "trigger";
  },
};

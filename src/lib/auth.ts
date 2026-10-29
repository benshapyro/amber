import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { env } from "./env";

function isAllowed(email: string) {
  return email.trim().toLowerCase() === env.allowedEmail;
}

async function sendMagicLinkEmail(email: string, url: string) {
  if (!env.resendKey) {
    // Local development: no email provider, so print the link.
    console.log(`\n[amber] Magic link for ${email}:\n${url}\n`);
    return;
  }
  await new Resend(env.resendKey).emails.send({
    from: env.emailFrom,
    to: email,
    subject: "Sign in to Amber",
    text: `Tap to sign in to Amber:\n\n${url}\n\nThe link works once and expires in 5 minutes.`,
  });
}

const appHost = new URL(env.appUrl).hostname;

export const auth = betterAuth({
  appName: "Amber",
  baseURL: env.appUrl,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  advanced: {
    // Spec: every ID is a stable UUID.
    database: { generateId: "uuid" },
  },
  emailAndPassword: { enabled: false },
  databaseHooks: {
    user: {
      create: {
        // Only one account may exist. This is the hard gate; the magic-link
        // sender below also stays silent for other addresses.
        before: async (user) => {
          if (!isAllowed(user.email)) {
            throw new APIError("FORBIDDEN", { message: "Sign-in is not open." });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 300,
      sendMagicLink: async ({ email, url }) => {
        if (!isAllowed(email)) return;
        await sendMagicLinkEmail(email, url);
      },
    }),
    passkey({ rpID: appHost, rpName: "Amber", origin: env.appUrl }),
    apiKey({
      defaultPrefix: "amber_",
      enableMetadata: true,
      // The Shortcut makes three calls per photo; a 40-photo share is 120.
      rateLimit: { enabled: true, timeWindow: 60 * 60 * 1000, maxRequests: 2000 },
    }),
    nextCookies(),
  ],
});

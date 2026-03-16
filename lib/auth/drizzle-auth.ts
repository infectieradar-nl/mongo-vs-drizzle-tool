import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../drizzle-db";
import {
  user,
  userAccount,
  userSession,
  userVerification,
} from "../drizzle-db/schema/drizzle-auth-schemas";
import { createParticipant } from "./drizzle-participant";

const siteUrl = process.env.APP_URL!;

export const drizzleAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: user,
      session: userSession,
      account: userAccount,
      verification: userVerification,
    },
  }),
  basePath: "/api/auth/drizzle",
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => password,
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        hash === password,
    },
  },
  user: { deleteUser: { enabled: true } },
  baseURL: siteUrl,
  advanced: {
    cookiePrefix: "drizzle-auth",
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser, _) => {
          await createParticipant(newUser.id);
        },
      },
    },
  },
});

export default drizzleAuth;

export type DrizzleSession = typeof drizzleAuth.$Infer.Session.session;

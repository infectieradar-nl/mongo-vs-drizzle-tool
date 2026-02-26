// lib/auth/participant.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../drizzle-db";
import { user, userAccount, userSession, userVerification } from "../drizzle-db/schema/drizzle-auth-schemas";

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
    emailAndPassword: { enabled: true },
    baseURL: siteUrl,
    advanced: {
        cookiePrefix: "drizzle-auth",
    }
});

export default drizzleAuth;

export type DrizzleSession = typeof drizzleAuth.$Infer.Session.session;
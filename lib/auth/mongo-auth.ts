import { betterAuth } from "better-auth";

const siteUrl = process.env.APP_URL!;

export const mongoAuth = betterAuth({
    // TODO: replace with mongo adapter - case-admin as an example
    /*     database: drizzleAdapter(db, {
            provider: "pg",
            schema: {
                user: researcher,
                session: researcherSession,
                account: researcherAccount,
                verification: researcherVerification,
            },
        }), */
    basePath: "/api/auth/mongo",
    baseURL: siteUrl,
    advanced: {
        cookiePrefix: "mongo-auth",
    },
    emailAndPassword: { enabled: true, allowSignUp: true },
});

export default mongoAuth;

export type MongoSession = typeof mongoAuth.$Infer.Session.session;

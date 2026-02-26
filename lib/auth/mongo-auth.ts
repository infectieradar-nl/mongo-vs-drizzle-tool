import { betterAuth } from "better-auth";
import { getDb } from "../mongo-db/db-registry";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const siteUrl = process.env.APP_URL!;


const mongoDb = await getDb()

export const mongoAuth = betterAuth({
    database: mongodbAdapter(mongoDb, {
        client: mongoDb.client,
        transaction: false,
    }),
    user: {
        modelName: 'case_participant_users',
    },
    account: {
        modelName: 'case_participant_accounts'
    },
    session: {
        modelName: 'case_participant_sessions'
    },
    verification: {
        modelName: 'case_participant_verifications'
    },
    basePath: "/api/auth/mongo",
    baseURL: siteUrl,
    advanced: {
        cookiePrefix: "mongo-auth",
    },
    emailAndPassword: { enabled: true, allowSignUp: true },
});

export default mongoAuth;

export type MongoSession = typeof mongoAuth.$Infer.Session.session;


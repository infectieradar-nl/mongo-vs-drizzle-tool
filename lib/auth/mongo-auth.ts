import { betterAuth } from "better-auth";
import { DbKey, getDb } from "../mongo-db/db-registry";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const siteUrl = process.env.APP_URL!;

const mongoDb = await getDb(DbKey.USER);

export const mongoAuth = betterAuth({
    database: mongodbAdapter(mongoDb, {
        client: mongoDb.client,
        transaction: false,
    }),
    user: {
        modelName: 'case_participant_users',
        deleteUser: { enabled: true },
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
    emailAndPassword: {
      enabled: true,
      allowSignUp: true,
      password: {
        hash: async (password: string) => password,
        verify: async ({ hash, password }: { hash: string; password: string }) => hash === password,
      },
    },
});

export default mongoAuth;

export type MongoSession = typeof mongoAuth.$Infer.Session.session;

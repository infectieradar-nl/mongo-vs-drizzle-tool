import { createAuthClient } from "better-auth/react" // make sure to import from better-auth/react

const siteUrl = process.env.APP_URL!;

export const drizzleAuthClient = createAuthClient({
    basePath: "/api/auth/drizzle",
    baseURL: siteUrl,
})
import { createAuthClient } from "better-auth/react" // make sure to import from better-auth/react


const siteUrl = process.env.APP_URL!;

export const mongoAuthClient = createAuthClient({
    basePath: "/api/auth/mongo",
    baseURL: siteUrl,
})

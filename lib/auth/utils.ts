import { headers } from "next/headers";
import { redirect } from "next/navigation"
import { mongoAuth } from "./mongo-auth";
import { drizzleAuth } from "./drizzle-auth";

export const requireMongoAuth = async (redirectTo: string = "/mongo/login") => {
    const session = await mongoAuth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect(redirectTo)
    }
    return session;
}

export const requireDrizzleAuth = async (redirectTo: string = "/drizzle/login") => {
    const session = await drizzleAuth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect(redirectTo)
    }
    return session;
}
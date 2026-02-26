import { drizzleAuth } from "@/lib/auth/drizzle-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(drizzleAuth);
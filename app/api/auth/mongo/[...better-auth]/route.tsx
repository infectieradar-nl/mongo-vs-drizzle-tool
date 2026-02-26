import { mongoAuth } from "@/lib/auth/mongo-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(mongoAuth);
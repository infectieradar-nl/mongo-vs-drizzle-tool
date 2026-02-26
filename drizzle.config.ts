import 'dotenv/config';
import type { Config } from "drizzle-kit";

export default {
    schema: "./lib/drizzle-db/schema",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.POSTGRES_DATABASE_URL!,
    },
} satisfies Config;
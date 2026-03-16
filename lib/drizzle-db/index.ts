import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_DATABASE_URL!,
  max: 50,
  min: 10,
  idleTimeoutMillis: 60000,
});

export const db = drizzle({ client: pool });

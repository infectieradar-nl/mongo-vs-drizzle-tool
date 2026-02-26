/**
 * MongoDB connection for standalone scripts (e.g. seed).
 * Does not import server-only, so it can run outside Next.js.
 */
import { Db, MongoClient, MongoClientOptions } from "mongodb";

const options: MongoClientOptions = {
  maxPoolSize: 5,
};

function mustGetEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

export async function getDbForScript(): Promise<Db> {
  const uri = mustGetEnv("MONGO_URI");
  const dbName = mustGetEnv("MONGO_DBNAME");
  const client = new MongoClient(uri, options);
  await client.connect();
  return client.db(dbName);
}

import { Db, MongoClient, MongoClientOptions } from "mongodb";

export const DbKey = {
  USER: "user",
  STUDY: "study",
} as const;

export type DbKey = (typeof DbKey)[keyof typeof DbKey];

const options: MongoClientOptions = {
  maxPoolSize: 5,
};

function mustGetEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

const config = {
  user: {
    uri: mustGetEnv("MONGO_USERDB_URI"),
    dbName: mustGetEnv("MONGO_DBNAME"),
  },
  study: {
    uri: mustGetEnv("MONGO_STUDYDB_URI"),
    dbName: mustGetEnv("MONGO_DBNAME"),
  },
} as const;

// Global caches (important for Next.js dev/HMR)
declare global {
  var __mongoClients: Map<string, MongoClient> | undefined;
}

function getClient(uri: string): MongoClient {
  const cache = (globalThis.__mongoClients ??= new Map<string, MongoClient>());

  const existing = cache.get(uri);
  if (existing) return existing;

  const client = new MongoClient(uri, options);
  cache.set(uri, client);
  return client;
}

export async function getDb(key: DbKey): Promise<Db> {
  const cfg = config[key];
  const client = getClient(cfg.uri);

  await client.connect();

  return client.db(cfg.dbName);
}

export async function getAllDbs(): Promise<Record<DbKey, Db>> {
  const [user, study] = await Promise.all([getDb(DbKey.USER), getDb(DbKey.STUDY)]);

  return { user, study };
}

import "server-only";

import { Db, MongoClient, MongoClientOptions } from "mongodb";

const options: MongoClientOptions = {
    maxPoolSize: 5,
};

function mustGetEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env: ${key}`);
    return value;
}

const uri = mustGetEnv("MONGO_URI");
const dbName = mustGetEnv("MONGO_DBNAME");

// Global cache (important for Next.js dev/HMR)
declare global {
    var __mongoClient: MongoClient | undefined;
}

function getClient(): MongoClient {
    if (globalThis.__mongoClient) return globalThis.__mongoClient;
    const client = new MongoClient(uri, options);
    globalThis.__mongoClient = client;
    return client;
}

export async function getDb(): Promise<Db> {
    const client = getClient();
    await client.connect();
    return client.db(dbName);
}


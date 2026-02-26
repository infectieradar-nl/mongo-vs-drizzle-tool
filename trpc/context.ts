import drizzleAuth from '@/lib/auth/drizzle-auth';
import mongoAuth from '@/lib/auth/mongo-auth';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { headers } from 'next/headers';


async function createContextFromHeaders(headers: Headers) {
  const drizzleSession = await drizzleAuth.api.getSession({
    headers,
  });
  const mongoSession = await mongoAuth.api.getSession({
    headers,
  });

  return {
    _drizzleSession: drizzleSession ?? null,
    _drizzleUser: drizzleSession?.user ?? null,
    _mongoSession: mongoSession ?? null,
    _mongoUser: mongoSession?.user ?? null,
  };
}

export async function createContext(opts: FetchCreateContextFnOptions) {
  return createContextFromHeaders(opts.req.headers);
}

export async function createServerContext() {
  const headersList = await headers();
  return createContextFromHeaders(headersList);
}

export type Context = Awaited<ReturnType<typeof createContext>>;

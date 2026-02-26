import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { type Context } from './context'
import { TRPCErrorCodes } from './utils'


const t = initTRPC.context<Context>().create({
  transformer: superjson,
});


export const router = t.router;
export const procedure = t.procedure;


const isDrizzleAuthUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx._drizzleSession || !ctx._drizzleUser) {
    throw new TRPCError({ code: TRPCErrorCodes.UNAUTHORIZED })
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx._drizzleSession,
      user: ctx._drizzleUser,
    },
  })
})

const isMongoAuthUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx._mongoSession || !ctx._mongoUser) {
    throw new TRPCError({ code: TRPCErrorCodes.UNAUTHORIZED })
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx._mongoSession,
      user: ctx._mongoUser,
    },
  })
})


export const drizzleAuthProcedure = procedure.use(isDrizzleAuthUser)
export const mongoAuthProcedure = procedure.use(isMongoAuthUser)

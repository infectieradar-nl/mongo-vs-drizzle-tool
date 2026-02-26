import { router, procedure } from '../init';
import { drizzleRouter } from './drizzle-router';
import { mongoRouter } from './mongo-router';

export const appRouter = router({
  mongo: mongoRouter,
  drizzle: drizzleRouter,

  // Example health check
  health: procedure.query(async () => {
    return { status: 'ok', timestamp: new Date() };
  }),
});

export type AppRouter = typeof appRouter;

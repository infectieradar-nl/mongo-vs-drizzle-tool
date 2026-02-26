import { router, procedure } from '../init';

import { singleSurveyFlowRouter } from './participant-routers/single-survey-flow';

import { projectsRouter } from './researcher-routers/projects';
import { surveysRouter } from './researcher-routers/surveys';
import { codeSetsRouter } from './researcher-routers/code-sets';
import { dataAccessRouter } from './researcher-routers/data-access';

// Group researcher-related routers
const researcherRouter = router({
  projects: projectsRouter,
  surveys: surveysRouter,
  codeSets: codeSetsRouter,
  dataAccess: dataAccessRouter,
});

// Group participant-related routers
const participantRouter = router({
  singleSurveyFlow: singleSurveyFlowRouter,
});

export const appRouter = router({
  researcher: researcherRouter,
  participant: participantRouter,

  // Example health check
  health: procedure.query(async () => {
    return { status: 'ok', timestamp: new Date() };
  }),
});

export type AppRouter = typeof appRouter;

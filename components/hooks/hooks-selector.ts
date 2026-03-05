import type { DatabaseType } from "../../lib/types";
import * as drizzleHooks from "@/components/hooks/drizzle-router-hooks";
import * as mongoHooks from "@/components/hooks/mongo-router-hooks";

export interface DashboardHooks {
  useGetUserCount: typeof drizzleHooks.useGetUserCount;
  useGetResponseCount: typeof drizzleHooks.useGetResponseCount;
  useGetDummyUserCount: typeof drizzleHooks.useGetDummyUserCount;
  useLoadSurveyByKey: typeof drizzleHooks.useLoadSurveyByKey;
  useGetRecentParticipantResponsesBySurveyKey: typeof drizzleHooks.useGetRecentParticipantResponsesBySurveyKey;
  useSubmitSurveyResponse: typeof drizzleHooks.useSubmitSurveyResponse;
  useStartAccountStressTest: typeof drizzleHooks.useStartAccountStressTest;
  useGetAccountStressTestProgress: typeof drizzleHooks.useGetAccountStressTestProgress;
  usePurgeAllOtherUsers: typeof drizzleHooks.usePurgeAllOtherUsers;
  usePurgeAllResponses: typeof drizzleHooks.usePurgeAllResponses;
  useStartContinuousSurveySpam: typeof drizzleHooks.useStartContinuousSurveySpam;
  useGetContinuousSurveySpamProgress: typeof drizzleHooks.useGetContinuousSurveySpamProgress;
  useStopContinuousSurveySpam: typeof drizzleHooks.useStopContinuousSurveySpam;
}

export const dashboardHooks: Record<DatabaseType, DashboardHooks> = {
  drizzle: drizzleHooks,
  mongo: mongoHooks,
};

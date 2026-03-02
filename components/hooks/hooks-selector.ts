import { DatabaseType } from "../features/home/dashboard-config";
import * as drizzleHooks from "@/components/hooks/drizzle-router-hooks";
import * as mongoHooks from "@/components/hooks/mongo-router-hooks";

export interface DashboardHooks {
  useGetUserCount: typeof drizzleHooks.useGetUserCount;
  useGetResponseCount: typeof drizzleHooks.useGetResponseCount;
  useLoadSurveyByKey: typeof drizzleHooks.useLoadSurveyByKey;
  useGetRecentParticipantResponsesBySurveyKey: typeof drizzleHooks.useGetRecentParticipantResponsesBySurveyKey;
  useSubmitSurveyResponse: typeof drizzleHooks.useSubmitSurveyResponse;
}

export const dashboardHooks: Record<DatabaseType, DashboardHooks> = {
  drizzle: drizzleHooks,
  mongo: mongoHooks,
};

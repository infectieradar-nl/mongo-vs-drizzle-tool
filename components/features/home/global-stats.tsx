"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";

interface GlobalStatsProps {
  dbType: DatabaseType;
}

const GlobalStats: React.FC<GlobalStatsProps> = ({ dbType }) => {
  const hooks = dashboardHooks[dbType];
  const { data: userCount, isLoading, error } = hooks.useGetUserCount();
  const {
    data: responseCount,
    isLoading: responseCountLoading,
    error: responseCountError,
  } = hooks.useGetResponseCount();
  const {
    data: dummyUserCount,
    isLoading: dummyUserCountLoading,
    error: dummyUserCountError,
  } = hooks.useGetDummyUserCount();

  return (
    <Card className="w-64">
      <CardHeader>
        <CardTitle>Global Stats</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="flex justify-between items-center">
          <span className="">User count: </span>
          <span
            className={`font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1 ${isLoading ? "animate-pulse" : ""}`}
          >
            {isLoading ? "..." : userCount}
          </span>
        </p>
        <p className="flex justify-between items-center">
          <span className="">Responses: </span>
          <span
            className={`font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1 ${responseCountLoading ? "animate-pulse" : ""}`}
          >
            {responseCountLoading ? "..." : responseCount}
          </span>
        </p>
        <p className="flex justify-between items-center">
          <span className="">Dummy users: </span>
          <span
            className={`font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1 ${dummyUserCountLoading ? "animate-pulse" : ""}`}
          >
            {dummyUserCountLoading ? "..." : dummyUserCount}
          </span>
        </p>
        {error && (
          <p className="text-sm text-destructive">
            Error (user count): {error.message}
          </p>
        )}
        {responseCountError && (
          <p className="text-sm text-destructive">
            Error (response count): {responseCountError.message}
          </p>
        )}
        {dummyUserCountError && (
          <p className="text-sm text-destructive">
            Error (dummy user count): {dummyUserCountError.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default GlobalStats;

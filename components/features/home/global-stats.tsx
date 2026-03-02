"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseType } from "./types";
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

  if (isLoading || responseCountLoading)
    return <div>Loading global stats...</div>;
  if (error) return <div>Error fetching global stats: {error.message}</div>;
  if (responseCountError)
    return (
      <div>Error fetching response count: {responseCountError.message}</div>
    );

  return (
    <Card className="w-64">
      <CardHeader>
        <CardTitle>Global Stats</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="flex justify-between items-center">
          <span className="">User count: </span>
          <span className="font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1">
            {userCount}
          </span>
        </p>
        <p className="flex justify-between items-center">
          <span className="">Responses: </span>
          <span className="font-bold font-mono text-end min-w-30 bg-muted rounded-md p-1">
            {responseCount}
          </span>
        </p>
      </CardContent>
    </Card>
  );
};

export default GlobalStats;

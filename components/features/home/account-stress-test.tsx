"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { LoadingButton } from "@/components/c-ui/loading-button";
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";

interface AccountStressTestProps {
  dbType: DatabaseType;
}

const AccountStressTest: React.FC<AccountStressTestProps> = ({ dbType }) => {
  const hooks = dashboardHooks[dbType];

  const [totalCount, setTotalCount] = useState(10);
  const [concurrencyLimit, setConcurrencyLimit] = useState(0);
  const [deleteAfterwards, setDeleteAfterwards] = useState(true);
  const [testId, setTestId] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);

  const startMutation = hooks.useStartAccountStressTest();
  const { data: progress } = hooks.useGetAccountStressTestProgress(
    testId,
    shouldPoll,
  );

  // Stop polling once test is complete
  if (progress && !progress.running && shouldPoll) {
    setShouldPoll(false);
  }

  const isRunning = progress?.running ?? false;
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const failed = progress?.failed ?? 0;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleStart = async () => {
    const effectiveLimit = concurrencyLimit > 0 ? concurrencyLimit : totalCount;
    setShouldPoll(true);
    const result = await startMutation.mutateAsync({
      totalCount,
      concurrencyLimit: effectiveLimit,
      deleteAfterwards,
    });
    setTestId(result.testId);
  };

  const handleReset = () => {
    setTestId(null);
    setShouldPoll(true);
  };

  const isDone = testId !== null && progress && !progress.running;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Dummy User Accounts</CardTitle>
        <CardDescription>
          Signup → Sign in → {deleteAfterwards ? "Delete account" : "Sign out"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Config inputs – disabled while running */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`total-count-${dbType}`}>Total count</Label>
            <Input
              id={`total-count-${dbType}`}
              type="number"
              min={1}
              max={10000}
              value={totalCount}
              onChange={(e) => setTotalCount(Number(e.target.value) || 1)}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`concurrency-${dbType}`}>Concurrency limit</Label>
            <Input
              id={`concurrency-${dbType}`}
              type="number"
              min={0}
              max={10000}
              placeholder="All"
              value={concurrencyLimit || ""}
              onChange={(e) => setConcurrencyLimit(Number(e.target.value) || 0)}
              disabled={isRunning}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`delete-${dbType}`}
            checked={deleteAfterwards}
            onCheckedChange={(v) => setDeleteAfterwards(v === true)}
            disabled={isRunning}
          />
          <Label htmlFor={`delete-${dbType}`} className="cursor-pointer">
            Delete accounts afterwards
          </Label>
        </div>

        {/* Action button */}
        {isDone ? (
          <LoadingButton
            className="w-full"
            onClick={handleReset}
            isLoading={false}
          >
            Reset
          </LoadingButton>
        ) : (
          <LoadingButton
            className="w-full"
            onClick={handleStart}
            isLoading={startMutation.isPending || isRunning}
            disabled={isRunning || totalCount < 1}
          >
            {isRunning ? "Running…" : "Run"}
          </LoadingButton>
        )}

        {/* Progress area – only shown after starting */}
        {testId && progress && (
          <div className="space-y-3 pt-2">
            <Progress value={percentComplete} className="h-2" />

            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {completed} / {total} workflows
              </span>
              <span>{percentComplete}%</span>
            </div>

            {failed > 0 && (
              <p className="text-sm text-destructive font-medium">
                {failed} failed
              </p>
            )}

            {isDone && progress.totalDurationMs !== null && (
              <p className="text-sm font-medium">
                Total duration:{" "}
                <span className="font-mono">{progress.totalDurationMs} ms</span>
              </p>
            )}

            {isDone && progress.averageDurationMs !== null && (
              <p className="text-sm font-medium">
                Avg. workflow duration:{" "}
                <span className="font-mono">
                  {progress.averageDurationMs} ms
                </span>
              </p>
            )}

            {isDone && progress.errors.length > 0 && (
              <details className="text-xs text-destructive">
                <summary className="cursor-pointer font-medium">
                  {progress.errors.length} error
                  {progress.errors.length !== 1 ? "s" : ""} – click to expand
                </summary>
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  {progress.errors.map((err, i) => (
                    <li key={i} className="break-all">
                      {err}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccountStressTest;

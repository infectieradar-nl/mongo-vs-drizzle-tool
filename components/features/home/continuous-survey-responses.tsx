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
import { LoadingButton } from "@/components/c-ui/loading-button";
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";

interface ContinuousSurveyResponsesProps {
  dbType: DatabaseType;
}

const ContinuousSurveyResponses: React.FC<ContinuousSurveyResponsesProps> = ({
  dbType,
}) => {
  const hooks = dashboardHooks[dbType];

  const [submissionsPerSecond, setSubmissionsPerSecond] = useState<number | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startMutation = hooks.useStartContinuousSurveySpam();
  const stopMutation = hooks.useStopContinuousSurveySpam();
  const { data: progress } = hooks.useGetContinuousSurveySpamProgress(
    testId,
    isActive,
  );

  const handleStart = async () => {
    try {
      const result = await startMutation.mutateAsync({
        submissionsPerSecond: submissionsPerSecond ?? 0,
      });
      setTestId(result.testId);
      setIsActive(true);
    } catch (error) {
      // Error handled by mutation state
    }
  };

  const handleStop = async () => {
    if (!testId) return;
    setIsActive(false);
    try {
      await stopMutation.mutateAsync({ testId });
    } catch {
      // Error handling is shown in progress stats
    }
  };

  const handleReset = () => {
    setTestId(null);
    setIsActive(false);
  };

  const isDone = testId !== null && !isActive;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Continuous Survey Responses</CardTitle>
        <CardDescription>Load Survey → Submit Response</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Config input – disabled while running */}
        <div className="space-y-1.5">
          <Label htmlFor={`rps-${dbType}`}>SPS (Submissions per second)</Label>
          <Input
            id={`rps-${dbType}`}
            type="number"
            min={0.1}
            step={0.1}
            placeholder="Leave empty for unlimited"
            value={submissionsPerSecond ?? ""}
            onChange={(e) => setSubmissionsPerSecond(e.target.value ? Number(e.target.value) : null)}
            disabled={isActive}
          />
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
        ) : isActive ? (
          <LoadingButton
            className="w-full"
            onClick={handleStop}
            isLoading={stopMutation.isPending}
            disabled={stopMutation.isPending}
          >
            Stop
          </LoadingButton>
        ) : (
          <LoadingButton
            className="w-full"
            onClick={handleStart}
            isLoading={startMutation.isPending}
          >
            Start Spamming
          </LoadingButton>
        )}

        {/* Stats area – only shown after starting */}
        {testId && progress && (
          <div className="space-y-2 pt-2 border-t">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Submissions</p>
                <p className="font-mono font-semibold">
                  {progress.totalSubmitted}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Achieved SPS</p>
                <p className="font-mono font-semibold">
                  {progress.submissionsPerSecond ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Avg Duration</p>
                <p className="font-mono font-semibold">
                  {progress.averageDurationMs !== null
                    ? `${progress.averageDurationMs} ms`
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Errors</p>
                <p
                  className={`font-mono font-semibold ${
                    progress.errors.length > 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {progress.errors.length}
                </p>
              </div>
            </div>

            {/* Error details */}
            {progress.errors.length > 0 && (
              <details className="text-xs text-destructive pt-2">
                <summary className="cursor-pointer font-medium">
                  {progress.errors.length} error
                  {progress.errors.length !== 1 ? "s" : ""} – click to expand
                </summary>
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  {progress.errors.slice(-10).map((err, i) => (
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

export default ContinuousSurveyResponses;

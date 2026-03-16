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

interface ContinuousResponseLookupProps {
  dbType: DatabaseType;
}

const ContinuousResponseLookup: React.FC<ContinuousResponseLookupProps> = ({
  dbType,
}) => {
  const hooks = dashboardHooks[dbType];

  const [lookupsPerSecond, setLookupsPerSecond] = useState<number | null>(null);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [testId, setTestId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startMutation = hooks.useStartContinuousResponseLookup();
  const stopMutation = hooks.useStopContinuousResponseLookup();
  const { data: progress } = hooks.useGetContinuousResponseLookupProgress(
    testId,
    isActive,
  );

  const handleStart = async () => {
    try {
      const result = await startMutation.mutateAsync({
        lookupsPerSecond: lookupsPerSecond ?? 0,
        batchSize,
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
        <CardTitle>Continuous Response Lookup</CardTitle>
        <CardDescription>
          Find Random Participant(s) → Get All Their Responses
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Config input – disabled while running */}
        <div className="space-y-1.5">
          <Label htmlFor={`lookup-lps-${dbType}`}>
            LPS (Lookups per second)
          </Label>
          <Input
            id={`lookup-lps-${dbType}`}
            type="number"
            min={0.1}
            step={0.1}
            placeholder="Leave empty for unlimited"
            value={lookupsPerSecond ?? ""}
            onChange={(e) =>
              setLookupsPerSecond(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            disabled={isActive}
          />
          <p className="text-xs text-muted-foreground">Max: 1000 LPS</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`lookup-batch-${dbType}`}>
            Batch Size (participants per lookup)
          </Label>
          <Input
            id={`lookup-batch-${dbType}`}
            type="number"
            min={1}
            max={100}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            disabled={isActive}
          />
          <p className="text-xs text-muted-foreground">
            Range: 1–100 participants
          </p>
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
            Start Lookups
          </LoadingButton>
        )}

        {/* Stats area – only shown after starting */}
        {testId && progress && (
          <div className="space-y-2 pt-2 border-t">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Lookups</p>
                <p className="font-mono font-semibold">
                  {progress.totalLookupsExecuted}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Current LPS</p>
                <p className="font-mono font-semibold">
                  {progress.lookupsPerSecond ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">Overall LPS</p>
                <p className="font-mono font-semibold">
                  {progress.overallLookupsPerSecond ?? "—"}
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
                <p className="text-muted-foreground">Avg Responses</p>
                <p className="font-mono font-semibold">
                  {progress.avgResponsesPerParticipant ?? "—"}
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

export default ContinuousResponseLookup;

"use client";

import { LoadingButton } from "@/components/c-ui/loading-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getErrorMessage } from "@/lib/get-error-message";
import { useState } from "react";
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";
import { benchmarkConstants } from "./constants-selector";

interface TestSurveyFlowProps {
  dbType: DatabaseType;
}

type FlowStatus = "idle" | "loading" | "success" | "error";

const TestSurveyFlow: React.FC<TestSurveyFlowProps> = ({ dbType }) => {
  const hooks = dashboardHooks[dbType];
  const constants = benchmarkConstants[dbType];

  const loadSurveyByKey = hooks.useLoadSurveyByKey();
  const submitSurveyResponse = hooks.useSubmitSurveyResponse();

  const SURVEY_BUTTONS = constants.surveys.map((survey) => ({
    label: survey.label,
    studyKey: constants.studyKey,
    surveyKey: survey.surveyKey,
  }));

  const [loadingBySurveyKey, setLoadingBySurveyKey] = useState<
    Record<string, boolean>
  >({});
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState<number | null>(null);

  const runSurveyFlow = async (params: (typeof SURVEY_BUTTONS)[number]) => {
    const startedAt = performance.now();
    setLoadingBySurveyKey((prev) => ({
      ...prev,
      [params.surveyKey]: true,
    }));
    setStatus("loading");
    setMessage(null);
    setElapsedTimeMs(null);

    try {
      const { participant, survey } = await loadSurveyByKey.mutateAsync({
        studyKey: params.studyKey,
        surveyKey: params.surveyKey,
      });

      await submitSurveyResponse.mutateAsync({
        studyKey: params.studyKey,
        surveyKey: params.surveyKey,
        participantId: participant.id,
        data: {
          source: "test-survey-flow",
          surveyKey: survey.key,
          submittedAtIso: new Date().toISOString(),
        },
      });

      const elapsed = Number((performance.now() - startedAt).toFixed(2));
      setStatus("success");
      setMessage(`${params.label}: Success.`);
      setElapsedTimeMs(elapsed);
    } catch (error) {
      const elapsed = Number((performance.now() - startedAt).toFixed(2));
      setStatus("error");
      setMessage(`${params.label}: ${getErrorMessage(error, "Failed.")}`);
      setElapsedTimeMs(elapsed);
    } finally {
      setLoadingBySurveyKey((prev) => ({
        ...prev,
        [params.surveyKey]: false,
      }));
    }
  };

  return (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Test Survey Flow</CardTitle>
        <CardDescription>
          Simulate loading and submitting a survey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {SURVEY_BUTTONS.map((button) => (
            <LoadingButton
              key={button.surveyKey}
              className="grow"
              isLoading={Boolean(loadingBySurveyKey[button.surveyKey])}
              onClick={() => runSurveyFlow(button)}
            >
              {button.label}
            </LoadingButton>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {status === "loading"
            ? "Loading survey and submitting response..."
            : `Request duration: ${elapsedTimeMs === null ? "N/A" : `${elapsedTimeMs} ms`}`}
        </p>

        {status === "error" && message && (
          <p className="text-sm text-destructive">Error: {message}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default TestSurveyFlow;

"use client";

import { LoadingButton } from "@/components/c-ui/loading-button";
import {
  useLoadSurveyByKeyMongo,
  useSubmitSurveyResponseMongo,
} from "@/components/hooks/mongo-router-hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MONGO_BENCHMARK_STUDY_KEY,
  MONGO_BENCHMARK_SURVEYS,
} from "@/lib/mongo-db/benchmark-seed";
import { getErrorMessage } from "@/lib/get-error-message";
import { useState } from "react";

const SURVEY_BUTTONS = MONGO_BENCHMARK_SURVEYS.map((survey) => ({
  label: survey.label,
  studyKey: MONGO_BENCHMARK_STUDY_KEY,
  surveyKey: survey.surveyKey,
}));

type FlowStatus = "idle" | "loading" | "success" | "error";

const TestSurveyFlowMongo = () => {
  const loadSurveyByKey = useLoadSurveyByKeyMongo();
  const submitSurveyResponse = useSubmitSurveyResponseMongo();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loadingBySurveyKey, setLoadingBySurveyKey] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [title, setTitle] = useState("Survey flow");
  const [message, setMessage] = useState("Ready");
  const [elapsedTimeMs, setElapsedTimeMs] = useState<number | null>(null);

  const isAnyButtonLoading = Object.values(loadingBySurveyKey).some(Boolean);

  const runSurveyFlow = async (params: (typeof SURVEY_BUTTONS)[number]) => {
    const startedAt = performance.now();
    setLoadingBySurveyKey((prev) => ({
      ...prev,
      [params.surveyKey]: true,
    }));
    setStatus("loading");
    setTitle(`Running ${params.label}`);
    setMessage("Loading survey and creating/submitting response...");
    setElapsedTimeMs(null);
    setIsDialogOpen(true);

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
      setTitle(`${params.label} complete`);
      setMessage("Survey response submitted successfully.");
      setElapsedTimeMs(elapsed);
    } catch (error) {
      const elapsed = Number((performance.now() - startedAt).toFixed(2));
      setStatus("error");
      setTitle(`${params.label} failed`);
      setMessage(getErrorMessage(error, "Survey flow failed"));
      setElapsedTimeMs(elapsed);
    } finally {
      setLoadingBySurveyKey((prev) => ({
        ...prev,
        [params.surveyKey]: false,
      }));
    }
  };

  const handleDialogChange = (open: boolean) => {
    if (isAnyButtonLoading) {
      return;
    }
    setIsDialogOpen(open);
  };

  return (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Test Survey Flow</CardTitle>
        <CardDescription>Simulate loading and submitting a survey.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
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
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent showCloseButton={!isAnyButtonLoading}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isAnyButtonLoading ? "Loading..." : status === "success" ? "Success" : "Error"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p>{message}</p>
            {elapsedTimeMs !== null && (
              <p className="text-sm text-muted-foreground">
                Elapsed time: {elapsedTimeMs} ms
              </p>
            )}
          </div>

          <DialogFooter showCloseButton={!isAnyButtonLoading} closeLabel="Dismiss" />
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TestSurveyFlowMongo;

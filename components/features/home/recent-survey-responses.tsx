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
import type { DatabaseType } from "../../../lib/types";
import { dashboardHooks } from "../../hooks/hooks-selector";
import { benchmarkConstants } from "./constants-selector";

interface RecentSurveyResponsesProps {
  dbType: DatabaseType;
}

interface SurveyResponsesCardProps {
  label: string;
  studyKey: string;
  surveyKey: string;
  dbType: DatabaseType;
}

const SurveyResponsesCard: React.FC<SurveyResponsesCardProps> = ({
  label,
  studyKey,
  surveyKey,
  dbType,
}) => {
  const hooks = dashboardHooks[dbType];
  const { data, isLoading, isFetching, error, refetch, requestDurationMs } =
    hooks.useGetRecentParticipantResponsesBySurveyKey({ studyKey, surveyKey });

  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Get Responses: {label}</CardTitle>
        <CardDescription>Key: {surveyKey}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p>Loading responses...</p>
        ) : error ? (
          <p>Error: {getErrorMessage(error, "Failed to load responses")}</p>
        ) : (
          <p>Loaded responses: {data?.responses.length ?? 0}</p>
        )}

        <p className="text-sm text-muted-foreground">
          Request duration:{" "}
          {requestDurationMs === null ? "N/A" : `${requestDurationMs} ms`}
        </p>

        <LoadingButton
          isLoading={isFetching}
          disabled={isFetching}
          onClick={() => void refetch()}
          className="w-full"
        >
          Reload
        </LoadingButton>
      </CardContent>
    </Card>
  );
};

const RecentSurveyResponses: React.FC<RecentSurveyResponsesProps> = ({
  dbType,
}) => {
  const constants = benchmarkConstants[dbType];

  const SURVEYS = constants.surveys.map((survey) => ({
    label: survey.label,
    studyKey: constants.studyKey,
    surveyKey: survey.surveyKey,
  }));

  return (
    <div className="flex flex-wrap gap-4">
      {SURVEYS.map((survey) => (
        <SurveyResponsesCard
          key={survey.surveyKey}
          label={survey.label}
          studyKey={survey.studyKey}
          surveyKey={survey.surveyKey}
          dbType={dbType}
        />
      ))}
    </div>
  );
};

export default RecentSurveyResponses;

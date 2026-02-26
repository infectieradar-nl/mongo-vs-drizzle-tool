"use client";

import { LoadingButton } from "@/components/c-ui/loading-button";
import { useGetRecentParticipantResponsesBySurveyKey } from "@/components/hooks/drizzle-router-hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DRIZZLE_BENCHMARK_STUDY_KEY,
    DRIZZLE_BENCHMARK_SURVEYS,
} from "@/lib/drizzle-db/benchmark-seed";
import { getErrorMessage } from "@/lib/get-error-message";

const SURVEYS = DRIZZLE_BENCHMARK_SURVEYS.map((survey) => ({
    label: survey.label,
    studyKey: DRIZZLE_BENCHMARK_STUDY_KEY,
    surveyKey: survey.surveyKey,
}));

const SurveyResponsesCard = ({
    label,
    studyKey,
    surveyKey,
}: {
    label: string;
    studyKey: string;
    surveyKey: string;
}) => {
    const { data, isLoading, isFetching, error, refetch, requestDurationMs } =
        useGetRecentParticipantResponsesBySurveyKey({ studyKey, surveyKey });

    return (
        <Card className="w-80">
            <CardHeader>
                <CardTitle>{label}</CardTitle>
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
                    Request duration: {requestDurationMs === null ? "N/A" : `${requestDurationMs} ms`}
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

const RecentSurveyResponsesDrizzle = () => {
    return (
        <div className="flex flex-wrap gap-4">
            {SURVEYS.map((survey) => (
                <SurveyResponsesCard
                    key={survey.surveyKey}
                    label={survey.label}
                    studyKey={survey.studyKey}
                    surveyKey={survey.surveyKey}
                />
            ))}
        </div>
    );
};

export default RecentSurveyResponsesDrizzle;

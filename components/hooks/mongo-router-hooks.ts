import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const liveCountQueryOptions = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: 2000,
  refetchIntervalInBackground: true,
};

export const useGetUserCount = () => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.mongo.getUserCount.queryOptions(),
    ...liveCountQueryOptions,
  });
};

export const useGetResponseCount = () => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.mongo.getResponseCount.queryOptions(),
    ...liveCountQueryOptions,
  });
};

export const useLoadSurveyByKey = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { studyKey: string; surveyKey: string }) => {
      return queryClient.fetchQuery({
        ...trpc.mongo.loadSurveyByKey.queryOptions(input),
        staleTime: 0,
        gcTime: 0,
      });
    },
  });
};

export const useGetRecentParticipantResponsesBySurveyKey = (input: {
  studyKey: string;
  surveyKey: string;
}) => {
  const trpc = useTRPC();
  const [requestDurationMs, setRequestDurationMs] = useState<number | null>(
    null,
  );
  const queryOptions =
    trpc.mongo.getRecentParticipantResponsesBySurveyKey.queryOptions(input);

  const query = useQuery({
    ...queryOptions,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (context) => {
      const startedAt = performance.now();
      try {
        if (!queryOptions.queryFn) {
          throw new Error("Missing query function for recent responses query");
        }
        return await queryOptions.queryFn(context);
      } finally {
        setRequestDurationMs(
          Number((performance.now() - startedAt).toFixed(2)),
        );
      }
    },
  });

  return {
    ...query,
    requestDurationMs,
  };
};

export const useSubmitSurveyResponse = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.mongo.submitSurveyResponse.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.mongo.getRecentParticipantResponsesBySurveyKey.pathFilter(),
        );
      },
    }),
  );
};

export const useStartAccountStressTest = () => {
  const trpc = useTRPC();
  return useMutation(
    trpc.mongo.startAccountStressTest.mutationOptions(),
  );
};

export const useGetAccountStressTestProgress = (testId: string | null, enabled: boolean = true) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.mongo.getAccountStressTestProgress.queryOptions(
      { testId: testId! },
    ),
    enabled: !!testId && enabled,
    refetchInterval: 200,
    staleTime: 0,
    gcTime: 0,
  });
};

export const DRIZZLE_BENCHMARK_STUDY_KEY = "study-1";

export const DRIZZLE_BENCHMARK_SURVEYS = [
  { label: "Survey 1", surveyKey: "survey-1" },
  { label: "Survey 2", surveyKey: "survey-2" },
] as const;

export const DRIZZLE_BENCHMARK_STUDY_CONFIGS: Record<string, unknown> = {
  name: "Benchmark Study",
  source: "db-init-script",
};

export const DRIZZLE_BENCHMARK_SURVEY_DEFINITIONS: Record<string, Record<string, unknown>> = {
  "survey-1": {
    title: "Survey 1",
    flow: "benchmark",
  },
  "survey-2": {
    title: "Survey 2",
    flow: "benchmark",
  },
};

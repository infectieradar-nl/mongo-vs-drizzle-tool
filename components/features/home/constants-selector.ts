import { DatabaseType } from "./dashboard-config";
import {
  DRIZZLE_BENCHMARK_STUDY_KEY,
  DRIZZLE_BENCHMARK_SURVEYS,
} from "@/lib/drizzle-db/benchmark-seed";
import {
  MONGO_BENCHMARK_STUDY_KEY,
  MONGO_BENCHMARK_SURVEYS,
} from "@/lib/mongo-db/benchmark-seed";

export interface BenchmarkConstants {
  studyKey: string;
  surveys: readonly { readonly label: string; readonly surveyKey: string }[];
}

export const benchmarkConstants: Record<DatabaseType, BenchmarkConstants> = {
  drizzle: {
    studyKey: DRIZZLE_BENCHMARK_STUDY_KEY,
    surveys: DRIZZLE_BENCHMARK_SURVEYS,
  },
  mongo: {
    studyKey: MONGO_BENCHMARK_STUDY_KEY,
    surveys: MONGO_BENCHMARK_SURVEYS,
  },
};

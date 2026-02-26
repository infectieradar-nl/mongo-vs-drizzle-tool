import "dotenv/config";
import {
  DRIZZLE_BENCHMARK_STUDY_CONFIGS,
  DRIZZLE_BENCHMARK_STUDY_KEY,
  DRIZZLE_BENCHMARK_SURVEY_DEFINITIONS,
  DRIZZLE_BENCHMARK_SURVEYS,
} from "../benchmark-seed";
import { study, survey } from "../schema/study-survey-schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.POSTGRES_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("POSTGRES_DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool });

const seed = async () => {
  const seededStudy = await db.transaction(async (tx) => {
    const [upsertedStudy] = await tx
      .insert(study)
      .values({
        key: DRIZZLE_BENCHMARK_STUDY_KEY,
        configs: DRIZZLE_BENCHMARK_STUDY_CONFIGS,
      })
      .onConflictDoUpdate({
        target: [study.key],
        set: {
          configs: DRIZZLE_BENCHMARK_STUDY_CONFIGS,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: study.id,
        key: study.key,
      });

    if (!upsertedStudy) {
      throw new Error("Failed to upsert benchmark study");
    }

    for (const benchmarkSurvey of DRIZZLE_BENCHMARK_SURVEYS) {
      await tx
        .insert(survey)
        .values({
          studyId: upsertedStudy.id,
          key: benchmarkSurvey.surveyKey,
          definition: DRIZZLE_BENCHMARK_SURVEY_DEFINITIONS[benchmarkSurvey.surveyKey] ?? {},
        })
        .onConflictDoUpdate({
          target: [survey.studyId, survey.key],
          set: {
            definition: DRIZZLE_BENCHMARK_SURVEY_DEFINITIONS[benchmarkSurvey.surveyKey] ?? {},
            updatedAt: new Date(),
          },
        });
    }

    return upsertedStudy;
  });

  console.log(
    `Seeded study '${seededStudy.key}' with ${DRIZZLE_BENCHMARK_SURVEYS.length} benchmark surveys.`,
  );
};

seed()
  .catch((error) => {
    console.error("Failed to seed benchmark study/surveys:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

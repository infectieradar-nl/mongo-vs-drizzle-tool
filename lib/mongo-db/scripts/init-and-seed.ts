import "dotenv/config";
import { DbKey, getAllDbs } from "../db-registry-core";
import { MONGO_COLLECTIONS } from "../collections";
import {
  MONGO_BENCHMARK_STUDY_CONFIGS,
  MONGO_BENCHMARK_STUDY_KEY,
  MONGO_BENCHMARK_SURVEY_DEFINITIONS,
  MONGO_BENCHMARK_SURVEYS,
} from "../benchmark-seed";
import { randomUUID } from "crypto";

const seed = async () => {
  const { user: userDb, study: studyDb } = await getAllDbs();

  // Touch the user DB to ensure both configured DB connections are initialized.
  await userDb.collection(MONGO_COLLECTIONS.users).estimatedDocumentCount();

  const studiesCol = studyDb.collection(MONGO_COLLECTIONS.studies);
  const surveysCol = studyDb.collection(MONGO_COLLECTIONS.surveys);
  const participantsCol = studyDb.collection(MONGO_COLLECTIONS.participants);
  const responsesCol = studyDb.collection(MONGO_COLLECTIONS.responses);

  await Promise.all([
    studiesCol.createIndexes([
      { key: { id: 1 }, name: "studies_id_uq", unique: true },
      { key: { key: 1 }, name: "studies_key_uq", unique: true },
    ]),
    surveysCol.createIndexes([
      { key: { id: 1 }, name: "surveys_id_uq", unique: true },
      { key: { studyId: 1 }, name: "surveys_study_id_idx" },
      { key: { studyId: 1, key: 1 }, name: "surveys_study_id_key_uq", unique: true },
    ]),
    participantsCol.createIndexes([
      { key: { id: 1 }, name: "participants_id_uq", unique: true },
      { key: { studyId: 1 }, name: "participants_study_id_idx" },
      { key: { userId: 1 }, name: "participants_user_id_idx" },
      {
        key: { studyId: 1, userId: 1 },
        name: "participants_study_id_user_id_uq",
        unique: true,
      },
    ]),
    responsesCol.createIndexes([
      { key: { id: 1 }, name: "responses_id_uq", unique: true },
      { key: { participantId: 1 }, name: "responses_participant_id_idx" },
      { key: { surveyId: 1, submittedAt: -1 }, name: "responses_survey_id_submitted_at_idx" },
      {
        key: { participantId: 1, surveyId: 1, submittedAt: -1 },
        name: "responses_participant_id_survey_id_submitted_at_idx",
      },
    ]),
  ]);

  const studyId = randomUUID();
  const now = new Date();

  await studiesCol.updateOne(
    { key: MONGO_BENCHMARK_STUDY_KEY },
    {
      $set: {
        key: MONGO_BENCHMARK_STUDY_KEY,
        configs: MONGO_BENCHMARK_STUDY_CONFIGS,
        updatedAt: now,
      },
      $setOnInsert: {
        id: studyId,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const study = await studiesCol.findOne({ key: MONGO_BENCHMARK_STUDY_KEY });
  if (!study) throw new Error("Failed to upsert benchmark study");

  const studyIdToUse = (study.id as string) ?? studyId;

  for (const benchmarkSurvey of MONGO_BENCHMARK_SURVEYS) {
    const surveyId = randomUUID();
    await surveysCol.updateOne(
      { studyId: studyIdToUse, key: benchmarkSurvey.surveyKey },
      {
        $set: {
          studyId: studyIdToUse,
          key: benchmarkSurvey.surveyKey,
          definition: MONGO_BENCHMARK_SURVEY_DEFINITIONS[benchmarkSurvey.surveyKey] ?? {},
          updatedAt: now,
        },
        $setOnInsert: {
          id: surveyId,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  console.log(
    `Ensured benchmark indexes and seeded study '${MONGO_BENCHMARK_STUDY_KEY}' with ${MONGO_BENCHMARK_SURVEYS.length} benchmark surveys (${DbKey.USER} DB initialized, ${DbKey.STUDY} DB seeded).`
  );
};

seed()
  .catch((error) => {
    console.error("Failed to seed benchmark study/surveys:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });

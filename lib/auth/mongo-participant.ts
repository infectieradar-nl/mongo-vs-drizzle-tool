import { DbKey, getDb } from "../mongo-db/db-registry";
import { MONGO_COLLECTIONS } from "../mongo-db/collections";
import { MONGO_BENCHMARK_STUDY_KEY } from "../mongo-db/benchmark-seed";
import { randomUUID } from "crypto";

export async function createParticipant(userId: string) {
  try {
    const studyDb = await getDb(DbKey.STUDY);
    const studiesCol = studyDb.collection(MONGO_COLLECTIONS.studies);
    const participantsCol = studyDb.collection(MONGO_COLLECTIONS.participants);

    const study = await studiesCol.findOne({ key: MONGO_BENCHMARK_STUDY_KEY });

    if (!study) {
      console.error("Default study not found for participant creation");
      return;
    }

    // Check if participant already exists
    const existingParticipant = await participantsCol.findOne({
      studyId: study.id,
      userId,
    });

    if (existingParticipant) {
      return; // Participant already exists, skip creation
    }

    const participantId = randomUUID();
    const now = new Date();

    await participantsCol.insertOne({
      id: participantId,
      studyId: study.id,
      userId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("Error creating default participant:", error);
  }
}

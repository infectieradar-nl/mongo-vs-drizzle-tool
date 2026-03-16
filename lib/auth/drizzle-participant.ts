import { db } from "../drizzle-db";
import {
  participant as participantTable,
  study as studyTable,
} from "../drizzle-db/schema/study-survey-schemas";
import { eq } from "drizzle-orm";
import { DRIZZLE_BENCHMARK_STUDY_KEY } from "../drizzle-db/benchmark-seed";

export async function createParticipant(userId: string) {
  // console.log(`Creating participant for userId: ${userId}`);
  try {
    const [study] = await db
      .select()
      .from(studyTable)
      .where(eq(studyTable.key, DRIZZLE_BENCHMARK_STUDY_KEY))
      .limit(1);

    if (!study) {
      console.error("Default study not found for participant creation");
      return;
    }

    // Check if participant already exists
    const existingParticipant = await db
      .select()
      .from(participantTable)
      .where(eq(participantTable.userId, userId))
      .limit(1);

    if (existingParticipant.length > 0) {
      return; // Participant already exists, skip creation
    }

    await db.insert(participantTable).values({
      studyId: study.id,
      userId,
    });
  } catch (error) {
    console.error("Error creating default participant:", error);
  }
}

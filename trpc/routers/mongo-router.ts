import { DbKey, getDb } from "@/lib/mongo-db/db-registry";
import { MONGO_COLLECTIONS } from "@/lib/mongo-db/collections";
import { mongoAuthProcedure as protectedProcedure, router } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { TRPCErrorCodes } from "../utils";
import {
  startStressTest,
  getStressTestProgress,
  emailPrefix,
} from "@/lib/auth/account-stress-test";
import mongoAuth from "@/lib/auth/mongo-auth";

export const mongoRouter = router({
  getUserCount: protectedProcedure.query(async () => {
    try {
      const userDb = await getDb(DbKey.USER);
      const userCount = await userDb
        .collection(MONGO_COLLECTIONS.users)
        .countDocuments();
      return userCount;
    } catch (error) {
      console.error("Error getting user count: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error getting user count",
      });
    }
  }),

  getDummyUserCount: protectedProcedure.query(async () => {
    try {
      const userDb = await getDb(DbKey.USER);
      const count = await userDb
        .collection(MONGO_COLLECTIONS.users)
        .countDocuments({
          email: { $regex: `^${emailPrefix}` },
        });
      return count;
    } catch (error) {
      console.error("Error getting dummy user count: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error getting dummy user count",
      });
    }
  }),

  getResponseCount: protectedProcedure.query(async () => {
    try {
      const studyDb = await getDb(DbKey.STUDY);
      const responseCount = await studyDb
        .collection(MONGO_COLLECTIONS.responses)
        .countDocuments();
      return responseCount;
    } catch (error) {
      console.error("Error getting response count: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error getting response count",
      });
    }
  }),

  loadSurveyByKey: protectedProcedure
    .input(
      z.object({
        studyKey: z.string().min(1),
        surveyKey: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      if (!userId) {
        throw new TRPCError({
          code: TRPCErrorCodes.UNAUTHORIZED,
          message: "Missing authenticated user",
        });
      }

      const studyDb = await getDb(DbKey.STUDY);
      const studiesCol = studyDb.collection(MONGO_COLLECTIONS.studies);
      const surveysCol = studyDb.collection(MONGO_COLLECTIONS.surveys);
      const participantsCol = studyDb.collection(
        MONGO_COLLECTIONS.participants,
      );

      const study = await studiesCol.findOne({ key: input.studyKey });
      if (!study) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const survey = await surveysCol.findOne({
        studyId: study.id,
        key: input.surveyKey,
      });
      if (!survey) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const studyId = study.id as string;

      let participant = await participantsCol.findOne({
        studyId,
        userId,
      });

      if (!participant) {
        const participantId = randomUUID();
        const now = new Date();
        try {
          await participantsCol.insertOne({
            id: participantId,
            studyId,
            userId,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          const existing = await participantsCol.findOne({
            studyId,
            userId,
          });
          if (!existing) {
            throw new TRPCError({
              code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
              message: "Failed to load or create participant",
            });
          }
          participant = existing;
        }
      }

      if (!participant) {
        participant = await participantsCol.findOne({
          studyId,
          userId,
        });
      }

      if (!participant) {
        throw new TRPCError({
          code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to load or create participant",
        });
      }

      return {
        survey: {
          id: survey.id,
          studyId: survey.studyId,
          key: survey.key,
          definition: survey.definition ?? {},
          createdAt: survey.createdAt,
          updatedAt: survey.updatedAt,
        },
        participant: {
          id: participant.id,
          studyId: participant.studyId,
          userId: participant.userId,
          createdAt: participant.createdAt,
          updatedAt: participant.updatedAt,
        },
      };
    }),

  submitSurveyResponse: protectedProcedure
    .input(
      z.object({
        studyKey: z.string().min(1),
        surveyKey: z.string().min(1),
        participantId: z.string().uuid(),
        data: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      if (!userId) {
        throw new TRPCError({
          code: TRPCErrorCodes.UNAUTHORIZED,
          message: "Missing authenticated user",
        });
      }

      const studyDb = await getDb(DbKey.STUDY);
      const studiesCol = studyDb.collection(MONGO_COLLECTIONS.studies);
      const surveysCol = studyDb.collection(MONGO_COLLECTIONS.surveys);
      const participantsCol = studyDb.collection(
        MONGO_COLLECTIONS.participants,
      );
      const responsesCol = studyDb.collection(MONGO_COLLECTIONS.responses);

      const study = await studiesCol.findOne({ key: input.studyKey });
      if (!study) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey is not available for this study",
        });
      }

      const survey = await surveysCol.findOne({
        studyId: study.id,
        key: input.surveyKey,
      });
      if (!survey) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey is not available for this study",
        });
      }

      const participant = await participantsCol.findOne({
        id: input.participantId,
        studyId: study.id,
        userId,
      });

      if (!participant) {
        throw new TRPCError({
          code: TRPCErrorCodes.FORBIDDEN,
          message:
            "Participant does not belong to the authenticated user in this study",
        });
      }

      const now = new Date();
      const responseDoc = {
        id: randomUUID(),
        participantId: participant.id,
        surveyId: survey.id,
        data: input.data,
        submittedAt: now,
      };

      await responsesCol.insertOne(responseDoc);

      return {
        id: responseDoc.id,
        participantId: responseDoc.participantId,
        surveyId: responseDoc.surveyId,
        data: responseDoc.data,
        submittedAt: responseDoc.submittedAt,
      };
    }),

  getRecentParticipantResponsesBySurveyKey: protectedProcedure
    .input(
      z.object({
        studyKey: z.string().min(1),
        surveyKey: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      if (!userId) {
        throw new TRPCError({
          code: TRPCErrorCodes.UNAUTHORIZED,
          message: "Missing authenticated user",
        });
      }

      const studyDb = await getDb(DbKey.STUDY);
      const studiesCol = studyDb.collection(MONGO_COLLECTIONS.studies);
      const surveysCol = studyDb.collection(MONGO_COLLECTIONS.surveys);
      const participantsCol = studyDb.collection(
        MONGO_COLLECTIONS.participants,
      );
      const responsesCol = studyDb.collection(MONGO_COLLECTIONS.responses);

      const study = await studiesCol.findOne({ key: input.studyKey });
      if (!study) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const survey = await surveysCol.findOne({
        studyId: study.id,
        key: input.surveyKey,
      });
      if (!survey) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const participant = await participantsCol.findOne({
        studyId: study.id,
        userId,
      });

      if (!participant) {
        return {
          participantId: null,
          surveyId: survey.id as string,
          responses: [],
        };
      }

      const responses = await responsesCol
        .find({
          participantId: participant.id,
          surveyId: survey.id,
        })
        .sort({ submittedAt: -1 })
        .limit(50)
        .toArray();

      return {
        participantId: participant.id as string,
        surveyId: survey.id as string,
        responses: responses.map((r) => ({
          id: r.id,
          participantId: r.participantId,
          surveyId: r.surveyId,
          submittedAt: r.submittedAt,
          data: r.data ?? {},
        })),
      };
    }),

  startAccountStressTest: protectedProcedure
    .input(
      z.object({
        totalCount: z.number().int().min(1).max(10000),
        concurrencyLimit: z.number().int().min(1).max(10000),
        deleteAfterwards: z.boolean(),
      }),
    )
    .mutation(({ input }) => {
      const testId = startStressTest(mongoAuth, "mongo-auth", {
        totalCount: input.totalCount,
        concurrencyLimit: input.concurrencyLimit,
        deleteAfterwards: input.deleteAfterwards,
      });
      return { testId };
    }),

  getAccountStressTestProgress: protectedProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .query(({ input }) => {
      const progress = getStressTestProgress(input.testId);
      if (!progress) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Stress test not found",
        });
      }
      return progress;
    }),

  purgeAllOtherUsers: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const userEmail = ctx.user.email;
      if (!userEmail) {
        throw new TRPCError({
          code: TRPCErrorCodes.UNAUTHORIZED,
          message: "Missing authenticated user email",
        });
      }

      const userDb = await getDb(DbKey.USER);
      const result = await userDb
        .collection(MONGO_COLLECTIONS.users)
        .deleteMany({ email: { $ne: userEmail } });

      return { deletedCount: result.deletedCount ?? 0 };
    } catch (error) {
      console.error("Error purging other users: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error purging other users",
      });
    }
  }),

  purgeAllResponses: protectedProcedure.mutation(async () => {
    try {
      const studyDb = await getDb(DbKey.STUDY);
      const result = await studyDb
        .collection(MONGO_COLLECTIONS.responses)
        .deleteMany({});

      return { deletedCount: result.deletedCount ?? 0 };
    } catch (error) {
      console.error("Error purging responses: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error purging responses",
      });
    }
  }),
});

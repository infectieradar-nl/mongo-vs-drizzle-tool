import { db } from "@/lib/drizzle-db";
import { user as userTable } from "@/lib/drizzle-db/schema/drizzle-auth-schemas";
import {
  participant as participantTable,
  response as responseTable,
  study as studyTable,
  survey as surveyTable,
} from "@/lib/drizzle-db/schema/study-survey-schemas";
import {
  drizzleAuthProcedure as protectedProcedure,
  router,
} from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, like, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCErrorCodes } from "../utils";
import {
  startStressTest,
  getStressTestProgress,
  emailPrefix,
} from "@/lib/auth/account-stress-test";
import drizzleAuth from "@/lib/auth/drizzle-auth";
import {
  startContinuousSurveySpam,
  getContinuousSurveySpamProgress,
  stopContinuousSurveySpam,
} from "@/lib/survey-response-spam";
import { getErrorMessage } from "@/lib/get-error-message";

export const drizzleRouter = router({
  getUserCount: protectedProcedure.query(async () => {
    try {
      const [userCount] = await db.select({ count: count() }).from(userTable);
      return userCount?.count ?? 0;
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
      const [result] = await db
        .select({ count: count() })
        .from(userTable)
        .where(like(userTable.email, `${emailPrefix}%`));
      return result?.count ?? 0;
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
      const [responseCount] = await db
        .select({ count: count() })
        .from(responseTable);
      return responseCount?.count ?? 0;
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

      const [surveyResult] = await db
        .select({
          survey: surveyTable,
          study: studyTable,
        })
        .from(surveyTable)
        .innerJoin(studyTable, eq(surveyTable.studyId, studyTable.id))
        .where(
          and(
            eq(studyTable.key, input.studyKey),
            eq(surveyTable.key, input.surveyKey),
          ),
        )
        .limit(1);

      if (!surveyResult) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const participant = await db.transaction(async (tx) => {
        const [existingParticipant] = await tx
          .select()
          .from(participantTable)
          .where(
            and(
              eq(participantTable.studyId, surveyResult.study.id),
              eq(participantTable.userId, userId),
            ),
          )
          .limit(1);

        if (existingParticipant) {
          return existingParticipant;
        }

        const [createdParticipant] = await tx
          .insert(participantTable)
          .values({
            studyId: surveyResult.study.id,
            userId,
          })
          .onConflictDoNothing({
            target: [participantTable.studyId, participantTable.userId],
          })
          .returning();

        if (createdParticipant) {
          return createdParticipant;
        }

        const [participantAfterConflict] = await tx
          .select()
          .from(participantTable)
          .where(
            and(
              eq(participantTable.studyId, surveyResult.study.id),
              eq(participantTable.userId, userId),
            ),
          )
          .limit(1);

        if (!participantAfterConflict) {
          throw new TRPCError({
            code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
            message: "Failed to load or create participant",
          });
        }

        return participantAfterConflict;
      });

      return {
        survey: surveyResult.survey,
        participant,
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

      const [surveyResult] = await db
        .select({
          survey: surveyTable,
          study: studyTable,
        })
        .from(surveyTable)
        .innerJoin(studyTable, eq(surveyTable.studyId, studyTable.id))
        .where(
          and(
            eq(studyTable.key, input.studyKey),
            eq(surveyTable.key, input.surveyKey),
          ),
        )
        .limit(1);

      if (!surveyResult) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey is not available for this study",
        });
      }

      const [participant] = await db
        .select()
        .from(participantTable)
        .where(
          and(
            eq(participantTable.id, input.participantId),
            eq(participantTable.studyId, surveyResult.study.id),
            eq(participantTable.userId, userId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new TRPCError({
          code: TRPCErrorCodes.FORBIDDEN,
          message:
            "Participant does not belong to the authenticated user in this study",
        });
      }

      const [createdResponse] = await db
        .insert(responseTable)
        .values({
          participantId: participant.id,
          surveyId: surveyResult.survey.id,
          data: input.data,
          submittedAt: new Date(),
        })
        .returning();

      if (!createdResponse) {
        throw new TRPCError({
          code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to submit survey response",
        });
      }

      return createdResponse;
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

      const [surveyResult] = await db
        .select({
          survey: surveyTable,
          study: studyTable,
        })
        .from(surveyTable)
        .innerJoin(studyTable, eq(surveyTable.studyId, studyTable.id))
        .where(
          and(
            eq(studyTable.key, input.studyKey),
            eq(surveyTable.key, input.surveyKey),
          ),
        )
        .limit(1);

      if (!surveyResult) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey not found for study",
        });
      }

      const [participant] = await db
        .select()
        .from(participantTable)
        .where(
          and(
            eq(participantTable.studyId, surveyResult.study.id),
            eq(participantTable.userId, userId),
          ),
        )
        .limit(1);

      if (!participant) {
        return {
          participantId: null,
          surveyId: surveyResult.survey.id,
          responses: [],
        };
      }

      const responses = await db
        .select()
        .from(responseTable)
        .where(
          and(
            eq(responseTable.participantId, participant.id),
            eq(responseTable.surveyId, surveyResult.survey.id),
          ),
        )
        .orderBy(desc(responseTable.submittedAt))
        .limit(50);

      return {
        participantId: participant.id,
        surveyId: surveyResult.survey.id,
        responses,
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
      const testId = startStressTest(drizzleAuth, "drizzle-auth", {
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

      const result = await db
        .delete(userTable)
        .where(ne(userTable.email, userEmail));

      return { deletedCount: result.rowCount ?? 0 };
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
      const result = await db.delete(responseTable);

      return { deletedCount: result.rowCount ?? 0 };
    } catch (error) {
      console.error("Error purging responses: " + error);
      throw new TRPCError({
        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
        message: "Error purging responses",
      });
    }
  }),

  startContinuousSurveySpam: protectedProcedure
    .input(
      z.object({
        submissionsPerSecond: z.number().min(0).max(1000),
      }),
    )
    .mutation(async ({ input }) => {
      // Get all studies
      const studies = await db.select().from(studyTable);

      if (studies.length === 0) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "No studies found",
        });
      }

      // Pick a random study
      const study = studies[Math.floor(Math.random() * studies.length)];

      // Get all surveys for the study
      const surveys = await db
        .select({ key: surveyTable.key })
        .from(surveyTable)
        .where(eq(surveyTable.studyId, study.id));

      if (surveys.length === 0) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "No surveys found for study",
        });
      }

      // Verify at least one participant exists
      const participantCount = await db
        .select({ count: count() })
        .from(participantTable)
        .where(eq(participantTable.studyId, study.id));

      if ((participantCount[0]?.count ?? 0) === 0) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "No participants found in study. Create at least one participant first.",
        });
      }

      // Helper function to load and submit a survey response
      const loadAndSubmitFn = async (surveyKey: string) => {
        const startTime = performance.now();
        try {
          // Load survey
          const [surveyResult] = await db
            .select({
              survey: surveyTable,
            })
            .from(surveyTable)
            .where(
              and(
                eq(surveyTable.studyId, study.id),
                eq(surveyTable.key, surveyKey),
              ),
            )
            .limit(1);

          if (!surveyResult) {
            throw new Error("Survey not found");
          }

          // Pick a random participant
          const [randomParticipant] = await db
            .select({ id: participantTable.id })
            .from(participantTable)
            .where(eq(participantTable.studyId, study.id))
            .orderBy(sql`RANDOM()`)
            .limit(1);

          if (!randomParticipant) {
            throw new Error("No participants found");
          }

          // Submit response
          await db.insert(responseTable).values({
            participantId: randomParticipant.id,
            surveyId: surveyResult.survey.id,
            data: {
              source: "continuous-survey-spam",
              surveyKey: surveyResult.survey.key,
              submittedAtIso: new Date().toISOString(),
            },
            submittedAt: new Date(),
          });

          const durationMs = Number((performance.now() - startTime).toFixed(2));
          return { durationMs };
        } catch (error) {
          const durationMs = Number((performance.now() - startTime).toFixed(2));
          return {
            durationMs,
            error: getErrorMessage(error, "Unknown error"),
          };
        }
      };

      const testId = startContinuousSurveySpam({
        surveys: surveys.map((s) => ({ surveyKey: s.key })),
        submissionsPerSecond: input.submissionsPerSecond,
        loadAndSubmitFn,
      });

      return { testId };
    }),

  getContinuousSurveySpamProgress: protectedProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .query(({ input }) => {
      const progress = getContinuousSurveySpamProgress(input.testId);
      if (!progress) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey spam test not found",
        });
      }
      return progress;
    }),

  stopContinuousSurveySpam: protectedProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .mutation(({ input }) => {
      const success = stopContinuousSurveySpam(input.testId);
      if (!success) {
        throw new TRPCError({
          code: TRPCErrorCodes.NOT_FOUND,
          message: "Survey spam test not found or already stopped",
        });
      }
      return { success: true };
    }),
});

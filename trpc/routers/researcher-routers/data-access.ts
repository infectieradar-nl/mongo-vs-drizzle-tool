import { router } from "@/trpc/init";
import { researcherAuthProcedure as protectedProcedure } from "@/trpc/init";
import { paginationSchema } from "../utils";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { TRPCErrorCodes } from "@/trpc/utils";
import { projectBelongsToUserCheck } from "./utils";
import { and, count, eq, asc, desc, gte, lte, max, sql } from "drizzle-orm";
import { projectParticipant } from "@/lib/db/schema/participant";
import { surveyResponse } from "@/lib/db/schema/response";
import { survey as surveyTable, surveyVersion as surveyVersionTable } from "@/lib/db/schema/survey";
import { db } from "@/lib/drizzle-db";


export const dataAccessRouter = router({
    getProjectParticipants: protectedProcedure.input(
        paginationSchema.extend({
            projectId: z.string(),
            sortBy: z.enum(['createdAt', 'lastSubmissionAt']).default('createdAt'),
            sortOrder: z.enum(['asc', 'desc']).default('asc'),
            isAnonymous: z.boolean().optional(),
        })
    ).query(async ({ input, ctx }) => {
        const { page, limit, projectId, sortBy, sortOrder, isAnonymous } = input;
        const userId = ctx.user.id;

        const projectBelongsToUser = await projectBelongsToUserCheck(projectId, userId);

        if (!projectBelongsToUser) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this project',
            });
        }

        // Build where clause
        const conditions = [eq(projectParticipant.projectId, projectId)];

        // Filter by isAnonymous if defined
        if (isAnonymous !== undefined) {
            conditions.push(eq(projectParticipant.isAnonymous, isAnonymous));
        }

        const whereClause = and(...conditions);

        // Build orderBy clause
        const sortColumn = sortBy === 'createdAt'
            ? projectParticipant.createdAt
            : projectParticipant.lastSubmissionAt;

        // When sorting descending, put nulls at the end
        // When sorting ascending, nulls naturally come first (standard SQL behavior)
        const orderBy = sortOrder === 'asc'
            ? asc(sortColumn)
            : sql`${sortColumn} DESC NULLS LAST`;

        // Calculate pagination offset
        const offset = (page - 1) * limit;

        // Fetch data
        const [totalCountForProject, totalCountForFilter, items] = await Promise.all([
            db.select({ total: count() })
                .from(projectParticipant)
                .where(eq(projectParticipant.projectId, projectId)),
            db.select({ total: count() })
                .from(projectParticipant)
                .where(whereClause),
            db.select()
                .from(projectParticipant)
                .where(whereClause)
                .orderBy(orderBy)
                .limit(limit)
                .offset(offset),
        ]);

        const countForFilter = totalCountForFilter && totalCountForFilter.length > 0 ? totalCountForFilter[0].total : 0;
        const totalForProject = totalCountForProject && totalCountForProject.length > 0 ? totalCountForProject[0].total : 0;
        const totalPages = Math.ceil(countForFilter / limit);

        // Clamp currentPage to valid range: if no pages exist, return 0; otherwise clamp between 1 and totalPages
        const currentPage = totalPages === 0 ? 0 : Math.min(Math.max(1, page), totalPages);

        const hasNextPage = countForFilter > offset + limit;
        const hasPreviousPage = currentPage > 1;

        return {
            totalCount: countForFilter,
            totalCountForProject: totalForProject,
            totalPages: totalPages,
            currentPage,
            items,
            hasNextPage,
            hasPreviousPage,
        };
    }),

    getParticipantCounts: protectedProcedure.input(
        z.object({
            projectId: z.string(),
        })
    ).query(async ({ input, ctx }) => {
        const { projectId } = input;
        const userId = ctx.user.id;

        // Verify project belongs to user
        const projectBelongsToUser = await projectBelongsToUserCheck(projectId, userId);

        if (!projectBelongsToUser) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this project',
            });
        }

        // Get counts for anonymous and non-anonymous participants
        const [anonymousCount, nonAnonymousCount] = await Promise.all([
            db.select({ total: count() })
                .from(projectParticipant)
                .where(
                    and(
                        eq(projectParticipant.projectId, projectId),
                        eq(projectParticipant.isAnonymous, true)
                    )
                ),
            db.select({ total: count() })
                .from(projectParticipant)
                .where(
                    and(
                        eq(projectParticipant.projectId, projectId),
                        eq(projectParticipant.isAnonymous, false)
                    )
                ),
        ]);

        return {
            anonymousCount: anonymousCount && anonymousCount.length > 0 ? anonymousCount[0].total : 0,
            nonAnonymousCount: nonAnonymousCount && nonAnonymousCount.length > 0 ? nonAnonymousCount[0].total : 0,
        };
    }),

    getResponseCounts: protectedProcedure.input(
        z.object({
            projectId: z.string(),
            participantId: z.string().optional(),
            surveyId: z.string().optional(),
            submittedAfter: z.date().optional(),
            submittedBefore: z.date().optional(),
        })
    ).query(async ({ input, ctx }) => {
        const { projectId, participantId, surveyId, submittedAfter, submittedBefore } = input;
        const userId = ctx.user.id;

        // Verify project belongs to user
        const projectBelongsToUser = await projectBelongsToUserCheck(projectId, userId);

        if (!projectBelongsToUser) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this project',
            });
        }

        // If surveyId is provided, group by surveyVersionId
        if (surveyId) {
            // Build where clause for responses
            const responseConditions = [
                eq(surveyResponse.projectId, projectId),
                eq(surveyResponse.surveyId, surveyId),
            ];
            if (participantId) {
                responseConditions.push(eq(surveyResponse.projectParticipantId, participantId));
            }
            if (submittedAfter) {
                responseConditions.push(gte(surveyResponse.submittedAt, submittedAfter));
            }
            if (submittedBefore) {
                responseConditions.push(lte(surveyResponse.submittedAt, submittedBefore));
            }
            const responseWhereClause = and(...responseConditions);

            const results = await db
                .select({
                    surveyVersionId: surveyResponse.surveyVersionId,
                    survey: surveyTable,
                    surveyVersionReleasedAt: surveyVersionTable.releasedAt,
                    count: count(),
                    lastResponseAt: max(surveyResponse.submittedAt),
                })
                .from(surveyResponse)
                .innerJoin(surveyTable, eq(surveyResponse.surveyId, surveyTable.id))
                .innerJoin(surveyVersionTable, eq(surveyResponse.surveyVersionId, surveyVersionTable.id))
                .where(responseWhereClause)
                .groupBy(surveyResponse.surveyVersionId, surveyTable.id, surveyVersionTable.id);

            return results;
        }

        // Otherwise, return counts grouped by surveyId for all surveys in the project
        // Build where clause for surveys
        const surveyConditions = [eq(surveyTable.projectId, projectId)];
        const surveyWhereClause = and(...surveyConditions);

        // Build join conditions for responses (filters go in join to include surveys with 0 responses)
        const joinConditions = [eq(surveyResponse.surveyId, surveyTable.id)];
        if (participantId) {
            joinConditions.push(eq(surveyResponse.projectParticipantId, participantId));
        }
        if (submittedAfter) {
            joinConditions.push(gte(surveyResponse.submittedAt, submittedAfter));
        }
        if (submittedBefore) {
            joinConditions.push(lte(surveyResponse.submittedAt, submittedBefore));
        }
        const joinClause = and(...joinConditions);

        // Use left join to include surveys with 0 responses
        const results = await db
            .select({
                survey: surveyTable,
                count: count(surveyResponse.id),
                lastResponseAt: max(surveyResponse.submittedAt),
            })
            .from(surveyTable)
            .leftJoin(surveyResponse, joinClause)
            .where(surveyWhereClause)
            .groupBy(surveyTable.id);

        return results;
    }),

    getSurveyResponses: protectedProcedure.input(z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().int().min(0).nullish(),
        projectId: z.string(),
        participantId: z.string().optional(),
        surveyId: z.string().optional(),
        surveyVersionId: z.string().optional(),
        submittedAfter: z.date().optional(),
        submittedBefore: z.date().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
    })).query(async ({ input, ctx }) => {
        const {
            cursor,
            limit,
            projectId,
            participantId,
            surveyId,
            surveyVersionId,
            submittedAfter,
            submittedBefore,
            sortOrder
        } = input;
        const userId = ctx.user.id;

        // Verify project belongs to user
        const projectBelongsToUser = await projectBelongsToUserCheck(projectId, userId);

        if (!projectBelongsToUser) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this project',
            });
        }

        // Build where clause
        const conditions = [eq(surveyResponse.projectId, projectId)];

        if (participantId) {
            conditions.push(eq(surveyResponse.projectParticipantId, participantId));
        }

        if (surveyId) {
            conditions.push(eq(surveyResponse.surveyId, surveyId));
        }

        if (surveyVersionId) {
            conditions.push(eq(surveyResponse.surveyVersionId, surveyVersionId));
        }

        if (submittedAfter) {
            conditions.push(gte(surveyResponse.submittedAt, submittedAfter));
        }

        if (submittedBefore) {
            conditions.push(lte(surveyResponse.submittedAt, submittedBefore));
        }

        const whereClause = and(...conditions);

        // Build orderBy clause
        const sortColumn = surveyResponse.submittedAt;
        const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

        // Use cursor as offset (number of items to skip)
        const offset = cursor ?? 0;

        // Fetch limit + 1 items to check if there's more data
        const items = await db.select()
            .from(surveyResponse)
            .where(whereClause)
            .orderBy(orderBy)
            .limit(limit + 1)
            .offset(offset);

        // Check if there's a next page
        const hasMore = items.length > limit;

        // Return only the requested limit of items
        const itemsToReturn = hasMore ? items.slice(0, limit) : items;

        // Set nextCursor to the current offset + items returned, or undefined if no more data
        const nextCursor = hasMore
            ? offset + itemsToReturn.length
            : undefined;

        return {
            items: itemsToReturn,
            nextCursor,
        };
    }),
});

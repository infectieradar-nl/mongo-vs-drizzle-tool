import { and, count, ilike, or, eq, like, asc, desc, inArray, getTableColumns } from "drizzle-orm";
import { router } from "@/trpc/init";
import { researcherAuthProcedure as protectedProcedure } from "@/trpc/init";
import { paginationSchema } from "../utils";
import { z } from "zod";
import logger from "@/lib/logger";
import { survey, surveyVersion, surveyShareLink, type SurveyVersion } from "@/lib/db/schema/survey";
import { project } from "@/lib/db/schema/projects";
import { surveyResponse } from "@/lib/db/schema/response";
import { db } from "@/lib/drizzle-db";
import { TRPCError } from "@trpc/server";
import { TRPCErrorCodes } from "@/trpc/utils";
import { projectBelongsToUserCheck } from "./utils";


export const surveysRouter = router({
    getSurveys: protectedProcedure.input(
        paginationSchema.extend({
            projectId: z.string(),
            search: z.string().max(25).optional(),
            state: z.enum(['active', 'archived']).optional(),
            sortBy: z.enum(['key', 'label', 'updatedAt']).default('updatedAt'),
        })
    ).query(async ({ input, ctx }) => {
        const { page, limit, search, projectId, sortBy, state } = input;
        const userId = ctx.user.id;
        const projectExists = await projectBelongsToUserCheck(projectId, userId);

        // check project belongs to user
        if (!projectExists) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'Project not found or you do not have access to it',
            });
        }

        logger.info(`Getting surveys for user: ${userId} project: ${projectId} with search: ${search}, state: ${state}, page: ${page} and limit: ${limit}`);

        const conditions = [
            eq(survey.projectId, projectId)
        ];

        // Filter by state if provided
        if (state) {
            conditions.push(eq(survey.state, state));
        }

        const normalizedSearch = search?.trim();
        if (normalizedSearch) {
            const searchCondition = or(
                like(survey.key, `%${normalizedSearch}%`),
                ilike(survey.label, `%${normalizedSearch}%`),
            );
            if (searchCondition) {
                conditions.push(searchCondition);
            }
        }

        const whereClause = and(...conditions);

        // Get paginated projects
        const offset = (page - 1) * limit;

        const orderBy = sortBy === 'key' ? asc(survey.key) : sortBy === 'label' ? asc(survey.label) : desc(survey.updatedAt);

        try {
            const [totalCountForProject, totalCountForSearch, items] = await Promise.all([
                db.select({ total: count() })
                    .from(survey)
                    .where(eq(survey.projectId, projectId)),
                db.select({ total: count() })
                    .from(survey)
                    .where(whereClause),
                db.select()
                    .from(survey)
                    .where(whereClause)
                    .orderBy(orderBy)
                    .limit(limit)
                    .offset(offset),
            ]);

            // Collect all version IDs that need to be fetched
            const versionIds: string[] = [];
            items.forEach(item => {
                if (item.draftVersionId) {
                    versionIds.push(item.draftVersionId);
                }
                if (item.activeReleaseVersionId) {
                    versionIds.push(item.activeReleaseVersionId);
                }
            });

            // Fetch the versions if there are any IDs
            let versions: SurveyVersion[] = [];
            if (versionIds.length > 0) {
                versions = await db.select()
                    .from(surveyVersion)
                    .where(inArray(surveyVersion.id, versionIds));
            }

            const countForSearch = totalCountForSearch && totalCountForSearch.length > 0 ? totalCountForSearch[0].total : 0;
            const totalForProject = totalCountForProject && totalCountForProject.length > 0 ? totalCountForProject[0].total : 0;
            const totalPages = Math.ceil(countForSearch / limit);

            // Clamp currentPage to valid range: if no pages exist, return 0; otherwise clamp between 1 and totalPages
            const currentPage = totalPages === 0 ? 0 : Math.min(Math.max(1, page), totalPages);

            const hasNextPage = countForSearch > offset + limit;
            const hasPreviousPage = currentPage > 1;

            return {
                surveys: items,
                versions,
                total: totalForProject,
                totalCount: countForSearch,
                currentPage,
                totalPages,
                page,
                limit,
                search,
                projectId,
                hasNextPage,
                hasPreviousPage,
            }
        } catch (error) {
            console.error(error);

            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Error getting surveys',
            });
        }


    }),

    // Get Survey
    getSurvey: protectedProcedure.input(z.object({
        id: z.string(),
    })).query(async ({ input, ctx }) => {
        const { id } = input;
        const userId = ctx.user.id;

        // Find the survey by ID
        const surveyResult = await db.select().from(survey).where(eq(survey.id, id));

        // Check if survey exists
        if (surveyResult.length === 0) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey not found',
            });
        }

        const foundSurvey = surveyResult[0];

        // Check if the project that the survey belongs to is owned by the user
        const projectBelongsToUser = await projectBelongsToUserCheck(foundSurvey.projectId, userId);

        if (!projectBelongsToUser) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this survey',
            });
        }

        // Get all versions of the survey (excluding definition)
        const versions = await db
            .select({
                id: surveyVersion.id,
                surveyId: surveyVersion.surveyId,
                versionNumber: surveyVersion.versionNumber,
                createdByUserId: surveyVersion.createdByUserId,
                createdAt: surveyVersion.createdAt,
                updatedAt: surveyVersion.updatedAt,
                releasedAt: surveyVersion.releasedAt,
                releasedByUserId: surveyVersion.releasedByUserId,
            })
            .from(surveyVersion)
            .where(eq(surveyVersion.surveyId, id))
            .orderBy(desc(surveyVersion.versionNumber));

        logger.info(`Getting survey ${id} for user: ${userId}`);

        return {
            ...foundSurvey,
            versions,
        };
    }),

    createSurvey: protectedProcedure.input(z.object({
        projectId: z.string(),
        key: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
        const { projectId, key, label, description } = input;
        const userId = ctx.user.id;

        // Check if the project exists
        const projectBelongsToUser = await projectBelongsToUserCheck(projectId, userId);
        if (!projectBelongsToUser) {
            logger.error(`Project ${projectId} not found for user ${userId}`);
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        try {
            // Create the survey with a default draft version in a transaction
            const result = await db.transaction(async (tx) => {
                // First, create the survey without a draftVersionId
                const [createdSurvey] = await tx.insert(survey).values({
                    projectId,
                    key,
                    label,
                    description,
                }).returning();

                // Create a default draft version for the survey
                const [createdVersion] = await tx.insert(surveyVersion).values({
                    surveyId: createdSurvey.id,
                    versionNumber: 1,
                    definition: {}, // Empty definition object by default
                    createdByUserId: userId,
                }).returning();

                // Update the survey to reference the draft version
                await tx.update(survey)
                    .set({ draftVersionId: createdVersion.id })
                    .where(eq(survey.id, createdSurvey.id));

                // Update project's updatedAt
                await tx.update(project)
                    .set({ updatedAt: new Date() })
                    .where(eq(project.id, projectId));

                return createdSurvey;
            });

            logger.info(`Survey created with default draft version for user ${userId}`);

            return result;
        } catch (error) {
            console.error(error);

            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Error creating survey',
            });
        }
    }),

    updateSurvey: protectedProcedure.input(z.object({
        id: z.string(),
        key: z.string().min(1),
        label: z.string().min(1),
        description: z.string().nullable().optional(),
        state: z.enum(['active', 'archived']).optional(),
        allowesDrafts: z.boolean().optional(),
        responseDraftExpirationSeconds: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
        const { id, key, label, description, state, allowesDrafts, responseDraftExpirationSeconds } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {

            const [authCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, id));

            if (!authCheck || authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to update this survey',
                });
            }

            await tx.update(survey)
                .set({ key, label, description, state, allowesDrafts, responseDraftExpirationSeconds })
                .where(eq(survey.id, id));

            const now = new Date();

            await tx.update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));
        });
    }),

    deleteSurvey: protectedProcedure.input(z.object({
        id: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const { id } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Check if survey exists and user owns the project
            const [authCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, id));

            if (!authCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey not found',
                });
            }

            if (authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to delete this survey',
                });
            }

            // Delete the survey (cascade will delete related versions, share links, and draft responses)
            // Note: survey responses are protected with restrict, so deletion will fail if any exist
            await tx.delete(survey).where(eq(survey.id, id));

            // Update project's updatedAt
            const now = new Date();
            await tx.update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));

            logger.info(`Survey ${id} deleted by user ${userId}`);
        });
    }),


    // get survey version
    getSurveyVersion: protectedProcedure.input(z.object({
        versionId: z.string(),
    })).query(async ({ input, ctx }) => {
        const { versionId } = input;
        const userId = ctx.user.id;

        // Get survey version and check if user owns the project
        const [result] = await db
            .select({
                version: surveyVersion,
                surveyId: survey.id,
                projectId: project.id,
                ownerId: project.ownerId,
            })
            .from(surveyVersion)
            .innerJoin(survey, eq(surveyVersion.surveyId, survey.id))
            .innerJoin(project, eq(survey.projectId, project.id))
            .where(eq(surveyVersion.id, versionId));

        if (!result) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        if (result.ownerId !== userId) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this survey version',
            });
        }

        logger.info(`Getting survey version ${versionId} for user: ${userId}`);

        return result.version;
    }),

    // update draft survey version
    updateDraftSurveyVersion: protectedProcedure.input(z.object({
        surveyId: z.string(),
        definition: z.any(), // jsonb definition
    })).mutation(async ({ input, ctx }) => {
        const { surveyId, definition } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Get the survey and check ownership
            const [surveyCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId,
                    draftVersionId: survey.draftVersionId,
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, surveyId));

            if (!surveyCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey not found',
                });
            }

            if (surveyCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to this survey',
                });
            }

            const now = new Date();
            let updatedVersion: SurveyVersion;

            // Check if there's a draft version
            if (!surveyCheck.draftVersionId) {
                // No draft version exists, create the first one
                const [newVersion] = await tx.insert(surveyVersion).values({
                    surveyId: surveyCheck.surveyId,
                    versionNumber: 1,
                    definition,
                    createdByUserId: userId,
                    releasedAt: null,
                    releasedByUserId: null,
                }).returning();

                // Update the survey to reference the new draft version
                await tx.update(survey)
                    .set({
                        draftVersionId: newVersion.id,
                        updatedAt: now
                    })
                    .where(eq(survey.id, surveyCheck.surveyId));

                updatedVersion = newVersion;
                logger.info(`Created first draft version for survey ${surveyCheck.surveyId} by user ${userId}`);
            } else {
                // Draft version exists, check if it has been released meanwhile
                const [draftVersion] = await tx
                    .select()
                    .from(surveyVersion)
                    .where(eq(surveyVersion.id, surveyCheck.draftVersionId));

                if (!draftVersion) {
                    throw new TRPCError({
                        code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                        message: 'Draft version reference is invalid',
                    });
                }

                const isReleased = draftVersion.releasedAt !== null;

                if (isReleased) {
                    // Draft has been released, create a new draft version
                    const [newVersion] = await tx.insert(surveyVersion).values({
                        surveyId: surveyCheck.surveyId,
                        versionNumber: draftVersion.versionNumber ? draftVersion.versionNumber + 1 : 1,
                        definition,
                        createdByUserId: userId,
                        releasedAt: null,
                        releasedByUserId: null,
                    }).returning();

                    // Update the survey to reference the new draft version
                    await tx.update(survey)
                        .set({
                            draftVersionId: newVersion.id,
                            updatedAt: now
                        })
                        .where(eq(survey.id, surveyCheck.surveyId));

                    updatedVersion = newVersion;
                    logger.info(`Created new draft version for survey ${surveyCheck.surveyId} (previous was released) by user ${userId}`);
                } else {
                    // Draft hasn't been released, update it
                    const [updated] = await tx.update(surveyVersion)
                        .set({
                            definition,
                            updatedAt: now
                        })
                        .where(eq(surveyVersion.id, surveyCheck.draftVersionId))
                        .returning();

                    // Update the survey's updatedAt
                    await tx.update(survey)
                        .set({ updatedAt: now })
                        .where(eq(survey.id, surveyCheck.surveyId));

                    updatedVersion = updated;
                    logger.info(`Updated draft version ${surveyCheck.draftVersionId} for survey ${surveyCheck.surveyId} by user ${userId}`);
                }
            }

            // Update project's updatedAt
            await tx.update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, surveyCheck.projectId));

            return updatedVersion;
        });
    }),

    // discard draft survey version (if not released yet)
    discardDraftSurveyVersion: protectedProcedure.input(z.object({
        surveyId: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const { surveyId } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Get the survey and check ownership
            const [surveyCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId,
                    draftVersionId: survey.draftVersionId,
                    activeReleaseVersionId: survey.activeReleaseVersionId,
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, surveyId));

            if (!surveyCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey not found',
                });
            }

            if (surveyCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to this survey',
                });
            }

            if (surveyCheck.draftVersionId === surveyCheck.activeReleaseVersionId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'The current draft version has already been released.',
                });
            }

            if (!surveyCheck.activeReleaseVersionId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'No active release version available to discard the draft.'
                })
            }

            // delete the draft version
            if (surveyCheck.draftVersionId) {
                await tx.delete(surveyVersion).where(
                    eq(surveyVersion.id, surveyCheck.draftVersionId)
                );
            }

            // Discard the draft version
            await tx.update(survey)
                .set({ draftVersionId: surveyCheck.activeReleaseVersionId })
                .where(eq(survey.id, surveyId));



            // Update project's updatedAt
            await tx.update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, surveyCheck.projectId));

            logger.info(`Draft version ${surveyCheck.draftVersionId} discarded for survey ${surveyId} by user ${userId}`);

            return { success: true };
        });

    }),

    // release survey version
    releaseSurveyNewVersion: protectedProcedure.input(z.object({
        surveyId: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const { surveyId } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Get the survey and check ownership
            const [authCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId,
                    draftVersionId: survey.draftVersionId,
                    releaseVersionId: survey.activeReleaseVersionId,
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, surveyId));

            if (!authCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey not found',
                });
            }

            if (authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to release this survey',
                });
            }

            if (!authCheck.draftVersionId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                    message: 'No draft version available to release',
                });
            }

            // Check if the draft version has already been released
            if (authCheck.releaseVersionId === authCheck.draftVersionId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'The current draft version has already been released.',
                });
            }

            const now = new Date();

            // Mark the draft version as released
            const [releasedVersion] = await tx
                .update(surveyVersion)
                .set({
                    releasedAt: now,
                    releasedByUserId: userId,
                })
                .where(eq(surveyVersion.id, authCheck.draftVersionId))
                .returning();

            // Update the survey to point to the released version
            await tx
                .update(survey)
                .set({
                    activeReleaseVersionId: releasedVersion.id,
                    updatedAt: now,
                })
                .where(eq(survey.id, surveyId));

            // Update project's updatedAt
            await tx
                .update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));

            logger.info(`Survey ${surveyId} version ${releasedVersion.id} released by user ${userId}`);

            return releasedVersion;
        });
    }),

    // create survey share link
    createSurveyShareLink: protectedProcedure.input(z.object({
        surveyId: z.string(),
        token: z.string(),
        testMode: z.boolean().optional(),
        enabled: z.boolean().optional(),
        requireAccountForAccess: z.boolean().optional(),
        redirectUrlAfterSubmission: z.string().nullable().optional(),
        responseLimit: z.number().int().positive().nullable().optional(),
        expiresAt: z.date().nullable().optional(),
        requireCodeForAccess: z.string().nullable().optional(),
        description: z.string().min(1, "Description is required"),
    })).mutation(async ({ input, ctx }) => {
        const { surveyId, token, testMode, enabled, requireAccountForAccess, redirectUrlAfterSubmission, responseLimit, expiresAt, requireCodeForAccess, description } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Check if survey exists and user owns the project
            const [authCheck] = await tx
                .select({
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId,
                })
                .from(survey)
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(survey.id, surveyId));

            if (!authCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey not found',
                });
            }

            if (authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to create share links for this survey',
                });
            }

            // Create the survey share link
            const [shareLink] = await tx.insert(surveyShareLink).values({
                surveyId,
                token,
                testMode,
                enabled,
                requireAccountForAccess,
                redirectUrlAfterSubmission,
                responseLimit,
                expiresAt,
                requireCodeForAccess,
                createdByUserId: userId,
                description,
            }).returning();

            // Update project's updatedAt
            const now = new Date();
            await tx.update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));

            logger.info(`Survey share link ${shareLink.id} created for survey ${surveyId} by user ${userId}`);

            return shareLink;
        });
    }),

    // get survey share link
    getSurveyShareLinks: protectedProcedure.input(z.object({
        surveyId: z.string(),
    })).query(async ({ input, ctx }) => {
        const { surveyId } = input;
        const userId = ctx.user.id;

        // Check if survey exists and user owns the project
        const [authCheck] = await db
            .select({
                surveyId: survey.id,
                projectId: project.id,
                ownerId: project.ownerId,
            })
            .from(survey)
            .innerJoin(project, eq(survey.projectId, project.id))
            .where(eq(survey.id, surveyId));

        if (!authCheck) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey not found',
            });
        }

        if (authCheck.ownerId !== userId) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'You do not have access to this survey',
            });
        }

        // Get survey share links with response counts
        const shareLinks = await db
            .select({
                ...getTableColumns(surveyShareLink),
                responseCount: count(surveyResponse.id),
            })
            .from(surveyShareLink)
            .leftJoin(surveyResponse, eq(surveyResponse.surveyLinkId, surveyShareLink.id))
            .where(eq(surveyShareLink.surveyId, surveyId))
            .groupBy(surveyShareLink.id)
            .orderBy(desc(surveyShareLink.createdAt));

        logger.info(`Getting ${shareLinks.length} share links for survey ${surveyId} for user ${userId}`);

        return shareLinks;
    }),

    // update survey share link
    updateSurveyShareLink: protectedProcedure.input(z.object({
        id: z.string(),
        token: z.string().optional(),
        expiresAt: z.date().nullable().optional(),
        testMode: z.boolean().nullable().optional(),
        requireCodeForAccess: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
        requireAccountForAccess: z.boolean().optional(),
        description: z.string().optional(),
        redirectUrlAfterSubmission: z.string().nullable().optional(),
        responseLimit: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
        const { id, token, expiresAt, testMode, requireCodeForAccess, enabled, requireAccountForAccess, description, redirectUrlAfterSubmission, responseLimit } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Check if share link exists and user owns the project
            const [authCheck] = await tx
                .select({
                    projectId: project.id,
                    ownerId: project.ownerId,
                })
                .from(surveyShareLink)
                .innerJoin(survey, eq(surveyShareLink.surveyId, survey.id))
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(surveyShareLink.id, id));

            if (!authCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey share link not found',
                });
            }

            if (authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to update this share link',
                });
            }

            // Build update object with only provided fields
            const updateData: {
                token?: string;
                expiresAt?: Date | null;
                requireCodeForAccess?: string | null;
                enabled?: boolean;
                requireAccountForAccess?: boolean;
                description?: string;
                redirectUrlAfterSubmission?: string | null;
                responseLimit?: number | null;
                testMode?: boolean;
            } = {};

            if (token !== undefined) updateData.token = token;
            if (expiresAt !== undefined) updateData.expiresAt = expiresAt;
            if (requireCodeForAccess !== undefined) updateData.requireCodeForAccess = requireCodeForAccess;
            if (enabled !== undefined) updateData.enabled = enabled;
            if (requireAccountForAccess !== undefined) updateData.requireAccountForAccess = requireAccountForAccess;
            if (description !== undefined) updateData.description = description;
            if (redirectUrlAfterSubmission !== undefined) updateData.redirectUrlAfterSubmission = redirectUrlAfterSubmission;
            if (responseLimit !== undefined) updateData.responseLimit = responseLimit;
            if (testMode !== undefined) updateData.testMode = testMode ?? false;

            // Validate that at least one field is provided for update
            if (Object.keys(updateData).length === 0) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'At least one field must be provided to update the share link',
                });
            }

            // Update the survey share link
            const [updatedShareLink] = await tx
                .update(surveyShareLink)
                .set(updateData)
                .where(eq(surveyShareLink.id, id))
                .returning();

            // Update project's updatedAt
            const now = new Date();
            await tx
                .update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));

            logger.info(`Survey share link ${id} updated by user ${userId}`);

            return updatedShareLink;
        });
    }),

    // delete survey share link
    deleteSurveyShareLink: protectedProcedure.input(z.object({
        id: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const { id } = input;
        const userId = ctx.user.id;

        return db.transaction(async (tx) => {
            // Check if share link exists and user owns the project
            const [authCheck] = await tx
                .select({
                    shareLinkId: surveyShareLink.id,
                    surveyId: survey.id,
                    projectId: project.id,
                    ownerId: project.ownerId,
                })
                .from(surveyShareLink)
                .innerJoin(survey, eq(surveyShareLink.surveyId, survey.id))
                .innerJoin(project, eq(survey.projectId, project.id))
                .where(eq(surveyShareLink.id, id));

            if (!authCheck) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey share link not found',
                });
            }

            if (authCheck.ownerId !== userId) {
                throw new TRPCError({
                    code: TRPCErrorCodes.UNAUTHORIZED,
                    message: 'You do not have access to delete this share link',
                });
            }

            // Delete the survey share link
            await tx.delete(surveyShareLink).where(eq(surveyShareLink.id, id));

            // Update project's updatedAt
            const now = new Date();
            await tx
                .update(project)
                .set({ updatedAt: now })
                .where(eq(project.id, authCheck.projectId));

            logger.info(`Survey share link ${id} deleted by user ${userId}`);
        });
    }),

});


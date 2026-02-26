import { participantAuthProcedure as protectedProcedure, router } from '../../init';
import logger from '@/lib/logger';
import { TRPCError } from '@trpc/server';
import { TRPCErrorCodes } from '../../utils';
import { z } from 'zod';
import { db } from '@/lib/drizzle-db';
import { projectParticipant as projectParticipantTable } from '@/lib/db/schema/participant';
import { project as projectTable } from '@/lib/db/schema/projects';
import { draftResponse as draftResponseTable, surveyResponse as surveyResponseTable } from '@/lib/db/schema/response';
import { survey as surveyTable, surveyVersion as surveyVersionTable, surveyShareLink as surveyShareLinkTable } from '@/lib/db/schema/survey';
import { eq, and, isNull, or, gt, count } from 'drizzle-orm';
import { projectCodeClaim as projectCodeClaimTable, projectAccessCode as projectAccessCodeTable, projectCodeSet as projectCodeSetTable } from '@/lib/db/schema/project-access-codes';


const getProject = async (projectId: string) => {
    const [projectRecord] = await db
        .select()
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .limit(1);
    return projectRecord;
}

const getProjectParticipant = async (projectId: string, userId: string) => {
    const [projectParticipantRecord] = await db
        .select()
        .from(projectParticipantTable)
        .where(and(eq(projectParticipantTable.userId, userId), eq(projectParticipantTable.projectId, projectId)))
        .limit(1);
    return projectParticipantRecord;
}

const getProjectCodeClaim = async (participantId: string, codeSetId: string) => {
    const [projectCodeClaimRecord] = await db
        .select({
            id: projectCodeClaimTable.id,
            codeId: projectCodeClaimTable.codeId,
            projectParticipantId: projectCodeClaimTable.projectParticipantId,
            claimedAt: projectCodeClaimTable.claimedAt,
        })
        .from(projectCodeClaimTable)
        .innerJoin(projectAccessCodeTable, eq(projectAccessCodeTable.id, projectCodeClaimTable.codeId))
        .where(and(
            eq(projectCodeClaimTable.projectParticipantId, participantId),
            eq(projectAccessCodeTable.codeSetId, codeSetId)
        ))
        .limit(1);
    return projectCodeClaimRecord;
}

const getDraftResponse = async (projectId: string, surveyId: string, projectParticipantId: string, createdAfter: Date | undefined) => {
    const whereClause = and(
        eq(draftResponseTable.projectId, projectId),
        eq(draftResponseTable.surveyId, surveyId),
        eq(draftResponseTable.projectParticipantId, projectParticipantId),
        createdAfter ? gt(draftResponseTable.startedAt, createdAfter) : undefined
    );
    const [draftResponseRecord] = await db
        .select()
        .from(draftResponseTable)
        .where(whereClause)
        .limit(1);
    return draftResponseRecord;
}

const getSurvey = async (surveyId: string) => {
    const [surveyRecord] = await db
        .select()
        .from(surveyTable)
        .where(eq(surveyTable.id, surveyId))
        .limit(1);
    return surveyRecord;
}

const getSurveyVersion = async (surveyVersionId: string) => {
    const [surveyVersionRecord] = await db
        .select()
        .from(surveyVersionTable)
        .where(eq(surveyVersionTable.id, surveyVersionId))
        .limit(1);
    return surveyVersionRecord;
}

const resolveSurveyShareLinkToken = async (token: string) => {
    const [result] = await db
        .select({
            surveyShareLink: surveyShareLinkTable,
            survey: surveyTable,
            project: projectTable,
        })
        .from(surveyShareLinkTable)
        .innerJoin(surveyTable, eq(surveyShareLinkTable.surveyId, surveyTable.id))
        .innerJoin(projectTable, eq(surveyTable.projectId, projectTable.id))
        .where(and(
            eq(surveyShareLinkTable.token, token),
            eq(surveyShareLinkTable.enabled, true),
            or(
                isNull(surveyShareLinkTable.expiresAt),
                gt(surveyShareLinkTable.expiresAt, new Date())
            )
        ))
        .limit(1);

    if (!result) {
        logger.error(`Invalid survey share link for token ${token}`);
        throw new TRPCError({
            code: TRPCErrorCodes.NOT_FOUND,
            message: 'Invalid survey share link',
        });
    }

    // Check if response limit has been reached (treat it like disabled)
    if (!result.surveyShareLink.testMode &&
        result.surveyShareLink.responseLimit !== null &&
        result.surveyShareLink.responseLimit !== undefined) {
        const [responseCountResult] = await db
            .select({ count: count() })
            .from(surveyResponseTable)
            .where(eq(surveyResponseTable.surveyLinkId, result.surveyShareLink.id));

        const responseCount = responseCountResult?.count ?? 0;

        if (responseCount >= result.surveyShareLink.responseLimit) {
            logger.error(`Survey share link ${result.surveyShareLink.id} has reached response limit`);
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Invalid survey share link',
            });
        }
    }

    return {
        surveyShareLink: result.surveyShareLink,
        survey: result.survey,
        project: result.project,
    };
}

const getValidSurveyShareLink = async (surveyShareLinkId: string) => {
    const [surveyShareLinkRecord] = await db
        .select()
        .from(surveyShareLinkTable)
        .where(and(
            eq(surveyShareLinkTable.id, surveyShareLinkId),
            eq(surveyShareLinkTable.enabled, true),
            or(
                isNull(surveyShareLinkTable.expiresAt),
                gt(surveyShareLinkTable.expiresAt, new Date())
            )
        ))
        .limit(1);

    return surveyShareLinkRecord;
}

const createProjectParticipantAndClaimCode = async (
    projectId: string,
    userId: string,
    isAnonymous: boolean,
    codeSetId: string,
    code: string
) => {
    return await db.transaction(async (tx) => {
        // 1. Check if code-set exists, is active, and not expired
        const [codeSet] = await tx
            .select()
            .from(projectCodeSetTable)
            .where(and(
                eq(projectCodeSetTable.id, codeSetId),
                eq(projectCodeSetTable.projectId, projectId),
                eq(projectCodeSetTable.status, 'active'),
                or(
                    isNull(projectCodeSetTable.expiresAt),
                    gt(projectCodeSetTable.expiresAt, new Date())
                )
            ))
            .limit(1);

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Code set not found, inactive, or expired',
            });
        }

        // 2. Check if code exists, is active, and belongs to the code-set
        const [accessCode] = await tx
            .select()
            .from(projectAccessCodeTable)
            .where(and(
                eq(projectAccessCodeTable.codeSetId, codeSetId),
                eq(projectAccessCodeTable.codeValue, code),
                eq(projectAccessCodeTable.status, 'active')
            ))
            .limit(1);

        if (!accessCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Invalid or inactive access code',
            });
        }

        // 3. Count existing claims for the code
        const [claimCountResult] = await tx
            .select({ count: count() })
            .from(projectCodeClaimTable)
            .where(eq(projectCodeClaimTable.codeId, accessCode.id));

        const currentClaimCount = claimCountResult?.count ?? 0;

        // 4. Check if claim count < maxClaimsPerCode (or maxClaimsPerCode is null for unlimited)
        if (codeSet.maxClaimsPerCode !== null && currentClaimCount >= codeSet.maxClaimsPerCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Code has reached maximum claim limit',
            });
        }

        // 5. Create project participant (with onConflictDoNothing to handle race conditions)
        const insertedParticipants = await tx
            .insert(projectParticipantTable)
            .values({
                userId,
                projectId,
                isAnonymous,
            })
            .onConflictDoNothing({
                target: [
                    projectParticipantTable.userId,
                    projectParticipantTable.projectId,
                ],
            })
            .returning();

        let projectParticipant;
        if (insertedParticipants.length > 0) {
            projectParticipant = insertedParticipants[0];
            logger.info(`Created project participant ${projectParticipant.id} for project ${projectId}`);
        } else {
            // If insert returned nothing (conflict occurred), fetch the existing participant
            const [existingParticipant] = await tx
                .select()
                .from(projectParticipantTable)
                .where(and(
                    eq(projectParticipantTable.userId, userId),
                    eq(projectParticipantTable.projectId, projectId)
                ))
                .limit(1);

            if (!existingParticipant) {
                throw new TRPCError({
                    code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                    message: 'Failed to create or retrieve project participant',
                });
            }

            // Check if anonymous attribute matches
            if (existingParticipant.isAnonymous !== isAnonymous) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'Anonymous attribute mismatch',
                });
            }

            projectParticipant = existingParticipant;
        }

        // 6. Create the claim
        const [newClaim] = await tx
            .insert(projectCodeClaimTable)
            .values({
                codeId: accessCode.id,
                projectParticipantId: projectParticipant.id,
            })
            .returning();

        // 7. Re-check claim count after insert to ensure it's still within limits
        const [updatedClaimCountResult] = await tx
            .select({ count: count() })
            .from(projectCodeClaimTable)
            .where(eq(projectCodeClaimTable.codeId, accessCode.id));

        const updatedClaimCount = updatedClaimCountResult?.count ?? 0;

        // 8. Roll back if exceeded (by throwing an error, which will rollback the transaction)
        if (codeSet.maxClaimsPerCode !== null && updatedClaimCount > codeSet.maxClaimsPerCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Code claim limit exceeded after claim creation',
            });
        }

        logger.info(`Created code claim ${newClaim.id} for code ${accessCode.id} by participant ${projectParticipant.id}`);

        return {
            participant: projectParticipant,
            claim: newClaim,
        };
    });
}

const claimCodeForParticipant = async (projectId: string, projectParticipantId: string, codeSetId: string, code: string) => {
    return await db.transaction(async (tx) => {
        // 1. Check if code-set exists, is active, and not expired (and belongs to the project)
        const [codeSet] = await tx
            .select()
            .from(projectCodeSetTable)
            .where(and(
                eq(projectCodeSetTable.id, codeSetId),
                eq(projectCodeSetTable.projectId, projectId),
                eq(projectCodeSetTable.status, 'active'),
                or(
                    isNull(projectCodeSetTable.expiresAt),
                    gt(projectCodeSetTable.expiresAt, new Date())
                )
            ))
            .limit(1);

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Code set not found, inactive, or expired',
            });
        }

        // 2 . Check if code exists, is active, and belongs to the code-set
        const [accessCode] = await tx
            .select()
            .from(projectAccessCodeTable)
            .where(and(
                eq(projectAccessCodeTable.codeSetId, codeSetId),
                eq(projectAccessCodeTable.codeValue, code),
                eq(projectAccessCodeTable.status, 'active')
            ))
            .limit(1);

        if (!accessCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Invalid or inactive access code',
            });
        }

        // 3. Check if participant already has a claim for this codeSet (to avoid duplicates)
        const [existingClaim] = await tx
            .select({
                id: projectCodeClaimTable.id,
                codeId: projectCodeClaimTable.codeId,
                projectParticipantId: projectCodeClaimTable.projectParticipantId,
                claimedAt: projectCodeClaimTable.claimedAt,
            })
            .from(projectCodeClaimTable)
            .innerJoin(projectAccessCodeTable, eq(projectAccessCodeTable.id, projectCodeClaimTable.codeId))
            .where(and(
                eq(projectCodeClaimTable.projectParticipantId, projectParticipantId),
                eq(projectAccessCodeTable.codeSetId, codeSetId)
            ))
            .limit(1);

        if (existingClaim) {
            // Participant already has a claim for this codeSet, return it
            return {
                claim: existingClaim,
            };
        }

        // 4. Count existing claims for the code
        const [claimCountResult] = await tx
            .select({ count: count() })
            .from(projectCodeClaimTable)
            .where(eq(projectCodeClaimTable.codeId, accessCode.id));

        const currentClaimCount = claimCountResult?.count ?? 0;

        // 5. Check if claim count < maxClaimsPerCode (or maxClaimsPerCode is null for unlimited)
        if (codeSet.maxClaimsPerCode !== null && currentClaimCount >= codeSet.maxClaimsPerCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Code has reached maximum claim limit',
            });
        }

        // 6. Create the claim
        const [newClaim] = await tx
            .insert(projectCodeClaimTable)
            .values({
                codeId: accessCode.id,
                projectParticipantId: projectParticipantId,
            })
            .returning();

        // 7. Re-check claim count after insert to ensure it's still within limits
        const [updatedClaimCountResult] = await tx
            .select({ count: count() })
            .from(projectCodeClaimTable)
            .where(eq(projectCodeClaimTable.codeId, accessCode.id));

        const updatedClaimCount = updatedClaimCountResult?.count ?? 0;

        // 8. Roll back if exceeded (by throwing an error, which will rollback the transaction)
        if (codeSet.maxClaimsPerCode !== null && updatedClaimCount > codeSet.maxClaimsPerCode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Code claim limit exceeded after claim creation',
            });
        }

        logger.info(`Created code claim ${newClaim.id} for code ${accessCode.id} by participant ${projectParticipantId}`);

        return {
            claim: newClaim,
        };
    });
}



export const singleSurveyFlowRouter = router({
    validateSurveyLink: protectedProcedure.input(
        z.object({
            token: z.string(),
        })
    ).query(async ({ input, ctx }) => {
        const { token } = input;
        const userId = ctx.user.id;
        const isAnonymous = ctx.user.isAnonymous ?? false;

        // Check if survey share link exists, with survey and project
        const { surveyShareLink, survey, project } = await resolveSurveyShareLinkToken(token);

        if (survey.activeReleaseVersionId === null) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'No survey version has been released yet',
            });
        }

        // TODO: check project quota - return error if quota is exceeded


        if (surveyShareLink.requireAccountForAccess && isAnonymous) {
            throw new TRPCError({
                code: TRPCErrorCodes.UNAUTHORIZED,
                message: 'Full login is required to access this survey',
            });
        }

        if (!surveyShareLink.testMode) {
            const projectParticipant = await getProjectParticipant(project.id, userId);
            if (!projectParticipant) {
                if (surveyShareLink.requireCodeForAccess) {
                    throw new TRPCError({
                        code: TRPCErrorCodes.PRECONDITION_REQUIRED,
                        message: 'code_required',
                    });
                }

                throw new TRPCError({
                    code: TRPCErrorCodes.PRECONDITION_REQUIRED,
                    message: 'participant_required',
                });
            } else {
                if (projectParticipant.isAnonymous !== isAnonymous) {
                    throw new TRPCError({
                        code: TRPCErrorCodes.BAD_REQUEST,
                        message: 'Anonymous attribute mismatch',
                    });
                }

                // if has participant, but no code claim, then code is required
                if (surveyShareLink.requireCodeForAccess) {
                    const projectCodeClaim = await getProjectCodeClaim(projectParticipant.id, surveyShareLink.requireCodeForAccess);
                    if (!projectCodeClaim) {
                        throw new TRPCError({
                            code: TRPCErrorCodes.PRECONDITION_REQUIRED,
                            message: 'code_required',
                        });
                    }
                }
            }
        }

        // retrieve currently released survey version
        const currentSurveyVersion = await getSurveyVersion(survey.activeReleaseVersionId);
        if (!currentSurveyVersion) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Currently released survey version not found',
            });
        }


        return {
            surveyShareLinkId: surveyShareLink.id,
            testMode: surveyShareLink.testMode,
            projectId: project.id,
            surveyId: survey.id,
            versionId: survey.activeReleaseVersionId,
            versionNumber: currentSurveyVersion.versionNumber,
            definition: currentSurveyVersion.definition,
            allowesDrafts: survey.allowesDrafts,
        };
    }),

    ensureParticipantIsWithCodeClaim: protectedProcedure.input(
        z.object({
            token: z.string(),
            code: z.string(),
        })
    ).mutation(async ({ input, ctx }) => {
        const { token, code } = input;
        const userId = ctx.user.id;
        const isAnonymous = ctx.user.isAnonymous ?? false;

        // Check if survey share link exists, with survey and project
        const { surveyShareLink, project } = await resolveSurveyShareLinkToken(token);

        if (!surveyShareLink.requireCodeForAccess || surveyShareLink.testMode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Code is not required to access this survey',
            });
        }

        const projectParticipant = await getProjectParticipant(project.id, userId);
        if (!projectParticipant) {
            // create project participant and claim code in single transaction
            const { participant, claim } = await createProjectParticipantAndClaimCode(project.id, userId, isAnonymous, surveyShareLink.requireCodeForAccess, code);

            // TODO: Call the project's entry event handler (tbd later)
            return {
                participantId: participant.id,
                claimId: claim.id,
            }
        } else {
            if (projectParticipant.isAnonymous !== isAnonymous) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: 'Anonymous attribute mismatch',
                });
            }

            // claim code for participant
            const { claim } = await claimCodeForParticipant(project.id, projectParticipant.id, surveyShareLink.requireCodeForAccess, code);

            return {
                participantId: projectParticipant.id,
                claimId: claim.id,
            }
        }
    }),


    createProjectParticipant: protectedProcedure.input(
        z.object({
            token: z.string(),
        })
    ).mutation(async ({ input, ctx }) => {
        const { token } = input;
        const userId = ctx.user.id;
        const isAnonymous = ctx.user.isAnonymous ?? false;

        // Check if survey share link exists, with survey and project
        const { project, surveyShareLink } = await resolveSurveyShareLinkToken(token);

        if (surveyShareLink.testMode) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Test mode is not allowed to create project participants',
            });
        }


        // Try to insert with onConflictDoNothing to handle race conditions
        const insertedParticipants = await db
            .insert(projectParticipantTable)
            .values({
                userId,
                projectId: project.id,
                isAnonymous,
            })
            .onConflictDoNothing({
                target: [
                    projectParticipantTable.userId,
                    projectParticipantTable.projectId,
                ],
            })
            .returning();

        // If insert succeeded (no conflict), return the new participant
        if (insertedParticipants.length > 0) {
            const newParticipant = insertedParticipants[0];
            logger.info(`Created project participant ${newParticipant.id} for project ${project.id}`);

            // TODO: Call the project's entry event handler (tbd later)

            return newParticipant;
        }

        // If insert returned nothing (conflict occurred), fetch the existing participant
        const existingParticipant = await getProjectParticipant(project.id, userId);
        if (!existingParticipant) {
            // This should never happen, but handle it gracefully
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Failed to create or retrieve project participant',
            });
        }

        // Check if anonymous attribute matches
        if (existingParticipant.isAnonymous !== isAnonymous) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Anonymous attribute mismatch',
            });
        }

        return existingParticipant;
    }),

    getDraftResponse: protectedProcedure.input(
        z.object({
            projectId: z.string(),
            surveyId: z.string(),
        })
    ).query(async ({ input, ctx }) => {
        const { projectId, surveyId } = input;
        const userId = ctx.user.id;

        if (ctx.user.isAnonymous) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Anonymous users cannot get draft responses.',
            });
        }

        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        // Get project participant
        const projectParticipant = await getProjectParticipant(projectId, userId);
        if (!projectParticipant) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project participant not found. Please create a project participant first.',
            });
        }

        // Check if survey allows drafts
        const survey = await getSurvey(surveyId);
        if (!survey) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey not found',
            });
        }
        if (!survey.allowesDrafts) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Drafts are not allowed for this survey',
            });
        }
        let createdAfter: Date | undefined;
        if (survey.responseDraftExpirationSeconds) {
            createdAfter = new Date(Date.now() - survey.responseDraftExpirationSeconds * 1000);
        }

        // Fetch draft response
        const draft = await getDraftResponse(projectId, surveyId, projectParticipant.id, createdAfter);

        return draft || null;
    }),

    saveDraftResponse: protectedProcedure.input(
        z.object({
            projectId: z.string(),
            surveyId: z.string(),
            currentVersionId: z.string(),
            revision: z.number().optional(),
            events: z.array(z.unknown()).optional(),
            responses: z.unknown().optional(),
            meta: z.unknown().optional(),
        })
    ).mutation(async ({ input, ctx }) => {
        const { projectId, surveyId, currentVersionId, revision, events, responses, meta } = input;
        const userId = ctx.user.id;

        if (ctx.user.isAnonymous) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Anonymous users cannot save draft responses.',
            });
        }

        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        // Check if survey exists
        const survey = await getSurvey(surveyId);
        if (!survey) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey not found',
            });
        }

        // Check if survey is archived
        if (survey.state !== 'active') {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Cannot save draft response for a survey that is not active',
            });
        }

        // Check if survey allows drafts
        if (!survey.allowesDrafts) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Drafts are not allowed for this survey',
            });
        }

        // Check if survey version exists
        const surveyVersion = await getSurveyVersion(currentVersionId);
        if (!surveyVersion) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        // Verify survey version belongs to the survey
        if (surveyVersion.surveyId !== surveyId) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Survey version does not belong to the specified survey',
            });
        }

        // Verify survey belongs to the project
        if (survey.projectId !== projectId) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Survey does not belong to the specified project',
            });
        }

        if (surveyVersion.releasedAt === null) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Cannot save draft response for a survey version that has not been released',
            });
        }

        // Get or create project participant
        const projectParticipant = await getProjectParticipant(projectId, userId);
        if (!projectParticipant) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project participant not found. Please create a project participant first.',
            });
        }

        // Use transaction to check and update/create draft atomically
        return await db.transaction(async (tx) => {
            // Try to insert with onConflictDoNothing to handle race conditions
            const insertedDrafts = await tx
                .insert(draftResponseTable)
                .values({
                    projectId,
                    surveyId,
                    currentVersionId,
                    projectParticipantId: projectParticipant.id,
                    revision: 0,
                    events,
                    responses,
                    meta,
                })
                .onConflictDoNothing({
                    target: [
                        draftResponseTable.surveyId,
                        draftResponseTable.projectParticipantId,
                    ],
                })
                .returning();

            // If insert succeeded (no conflict), return the new draft
            if (insertedDrafts.length > 0) {
                const newDraft = insertedDrafts[0];
                logger.info(`Created draft response ${newDraft.id} for survey ${surveyId}`);
                return newDraft;
            }

            // If insert returned nothing (conflict occurred), fetch and update the existing draft
            const [existingDraft] = await tx
                .select()
                .from(draftResponseTable)
                .where(
                    and(
                        eq(draftResponseTable.projectId, projectId),
                        eq(draftResponseTable.surveyId, surveyId),
                        eq(draftResponseTable.projectParticipantId, projectParticipant.id)
                    )
                )
                .limit(1);

            if (!existingDraft) {
                // This should never happen, but handle it gracefully
                throw new TRPCError({
                    code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                    message: 'Failed to create or retrieve draft response',
                });
            }

            // If revision is provided, verify it matches the current revision
            if (revision !== undefined && revision !== existingDraft.revision) {
                throw new TRPCError({
                    code: TRPCErrorCodes.BAD_REQUEST,
                    message: `Revision mismatch. Expected revision ${existingDraft.revision}, but received ${revision}.`,
                });
            }

            // Update existing draft with incremented revision
            const [updatedDraft] = await tx
                .update(draftResponseTable)
                .set({
                    currentVersionId,
                    revision: existingDraft.revision + 1,
                    lastSavedAt: new Date(),
                    events: events !== undefined ? events : existingDraft.events,
                    responses: responses !== undefined ? responses : existingDraft.responses,
                    meta: meta !== undefined ? meta : existingDraft.meta,
                })
                .where(eq(draftResponseTable.id, existingDraft.id))
                .returning();

            // Check if draft was deleted between SELECT and UPDATE (e.g., by concurrent submitResponse)
            if (!updatedDraft) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Draft response not found or was deleted',
                });
            }

            logger.info(`Updated draft response ${updatedDraft.id} for survey ${surveyId}`);
            return updatedDraft;
        });
    }),

    submitResponse: protectedProcedure.input(
        z.object({
            projectId: z.string(),
            surveyShareLinkId: z.string(),
            surveyId: z.string(),
            surveyVersionId: z.string(),
            events: z.array(z.unknown()).optional(),
            responses: z.unknown().optional(),
            meta: z.unknown().optional(),
        })
    ).mutation(async ({ input, ctx }) => {
        const { projectId, surveyShareLinkId, surveyId, surveyVersionId, events, responses, meta } = input;
        const userId = ctx.user.id;

        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        // Check if survey exists
        const survey = await getSurvey(surveyId);
        if (!survey) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey not found',
            });
        }

        // Check if survey share link exists
        const surveyShareLink = await getValidSurveyShareLink(surveyShareLinkId);
        if (!surveyShareLink ||
            surveyShareLink.surveyId !== surveyId ||
            (surveyShareLink.requireAccountForAccess && ctx.user.isAnonymous)
        ) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey share link not found',
            });
        }

        if (surveyShareLink.testMode) {
            return {
                redirectUrl: surveyShareLink.redirectUrlAfterSubmission,
                submittedResponse: {
                    id: 'test',
                },
            }
        }

        // Check if survey is archived
        if (survey.state !== 'active') {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Cannot submit response for a survey that is not active',
            });
        }

        // Check if survey version exists
        const surveyVersion = await getSurveyVersion(surveyVersionId);
        if (!surveyVersion) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Survey version not found',
            });
        }

        // Verify survey version belongs to the survey
        if (surveyVersion.surveyId !== surveyId) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Survey version does not belong to the specified survey',
            });
        }

        // Verify survey belongs to the project
        if (survey.projectId !== projectId) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Survey does not belong to the specified project',
            });
        }

        if (surveyVersion.releasedAt === null) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: 'Cannot submit response for a survey version that has not been released',
            });
        }

        // Get project participant
        const projectParticipant = await getProjectParticipant(projectId, userId);
        if (!projectParticipant) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project participant not found. Please create a project participant first.',
            });
        }

        // Check if code claim is required and participant has valid claim
        if (surveyShareLink.requireCodeForAccess) {
            const projectCodeClaim = await getProjectCodeClaim(projectParticipant.id, surveyShareLink.requireCodeForAccess);
            if (!projectCodeClaim) {
                throw new TRPCError({
                    code: TRPCErrorCodes.PRECONDITION_REQUIRED,
                    message: 'code_required',
                });
            }
        }

        // Use transaction to ensure atomicity
        return await db.transaction(async (tx) => {
            // Lock the surveyShareLink row and re-validate it inside the transaction
            // This prevents concurrent transactions from exceeding the response limit
            const [lockedSurveyShareLink] = await tx
                .select()
                .from(surveyShareLinkTable)
                .where(and(
                    eq(surveyShareLinkTable.id, surveyShareLinkId),
                    eq(surveyShareLinkTable.enabled, true),
                    or(
                        isNull(surveyShareLinkTable.expiresAt),
                        gt(surveyShareLinkTable.expiresAt, new Date())
                    )
                ))
                .limit(1)
                .for('update');

            if (!lockedSurveyShareLink) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: 'Survey share link not found or disabled',
                });
            }

            // Check response limit BEFORE inserting (with row lock held)
            if (lockedSurveyShareLink.responseLimit !== null && lockedSurveyShareLink.responseLimit !== undefined) {
                const [responseCountResult] = await tx
                    .select({ count: count() })
                    .from(surveyResponseTable)
                    .where(eq(surveyResponseTable.surveyLinkId, surveyShareLinkId));

                const responseCount = responseCountResult?.count ?? 0;

                // If count already at or exceeds limit, reject the submission
                if (responseCount >= lockedSurveyShareLink.responseLimit) {
                    throw new TRPCError({
                        code: TRPCErrorCodes.BAD_REQUEST,
                        message: 'Response limit reached for this survey share link',
                    });
                }
            }

            // Insert survey response with surveyLinkId
            const [submittedResponse] = await tx
                .insert(surveyResponseTable)
                .values({
                    projectId,
                    surveyId,
                    surveyVersionId,
                    surveyLinkId: surveyShareLinkId,
                    projectParticipantId: projectParticipant.id,
                    events,
                    responses,
                    meta,
                })
                .returning();

            // Update participant's lastSubmissionAt
            await tx
                .update(projectParticipantTable)
                .set({
                    lastSubmissionAt: new Date(),
                })
                .where(eq(projectParticipantTable.id, projectParticipant.id));

            // Delete any drafts for this survey and project participant
            await tx
                .delete(draftResponseTable)
                .where(
                    and(
                        eq(draftResponseTable.surveyId, surveyId),
                        eq(draftResponseTable.projectParticipantId, projectParticipant.id)
                    )
                );


            logger.info(`Submitted response ${submittedResponse.id} for survey ${surveyId}`);
            return {
                redirectUrl: surveyShareLink.redirectUrlAfterSubmission,
                submittedResponse
            };
        });
    }),

});
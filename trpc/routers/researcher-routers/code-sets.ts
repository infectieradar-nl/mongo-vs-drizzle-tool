import { router } from "@/trpc/init";
import { researcherAuthProcedure as protectedProcedure } from "@/trpc/init";
import { z } from "zod";
import { paginationSchema } from "../utils";
import { db } from "@/lib/drizzle-db";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { project } from "@/lib/db/schema/projects";
import { projectCodeSet, projectAccessCode, projectCodeClaim } from "@/lib/db/schema/project-access-codes";
import logger from "@/lib/logger";
import { TRPCError } from "@trpc/server";
import { TRPCErrorCodes } from "@/trpc/utils";
import { createHash } from "crypto";

// Helper function to hash codes using SHA-256
function hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}

export const codeSetsRouter = router({
    // create code set
    createCodeSet: protectedProcedure.input(z.object({
        projectId: z.string(),
        label: z.string().min(1, "Label is required"),
        storePlaintext: z.boolean().default(false),
        maxClaimsPerCode: z.number().int().positive().optional(),
        expiresAt: z.date().optional(),
    })).mutation(async ({ input, ctx }) => {
        const { projectId, label, storePlaintext, maxClaimsPerCode, expiresAt } = input;
        const userId = ctx.user.id;

        logger.info(`Creating code set for project ${projectId} by user ${userId}`);

        // check if project belongs to user
        const [foundProject] = await db
            .select()
            .from(project)
            .where(and(eq(project.id, projectId), eq(project.ownerId, userId)));

        if (!foundProject) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Project not found",
            });
        }

        try {
            // create code set
            const [createdCodeSet] = await db
                .insert(projectCodeSet)
                .values({
                    projectId,
                    label,
                    storePlaintext,
                    maxClaimsPerCode: maxClaimsPerCode ?? null,
                    expiresAt: expiresAt ?? null,
                    createdByUserId: userId,
                })
                .returning();

            // update project updatedAt
            await db
                .update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, projectId));

            logger.info(`Successfully created code set ${createdCodeSet.id}`);

            return createdCodeSet;
        } catch (error) {
            logger.error(`Failed to create code set: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: "Failed to create code set",
            });
        }
    }),

    // get code sets
    getCodeSets: protectedProcedure.input(z.object({
        projectId: z.string(),
    })).query(async ({ input, ctx }) => {
        const { projectId } = input;
        const userId = ctx.user.id;

        logger.info(`Getting code sets for project ${projectId} by user ${userId}`);

        // check if project belongs to user
        const [foundProject] = await db
            .select()
            .from(project)
            .where(and(eq(project.id, projectId), eq(project.ownerId, userId)));

        if (!foundProject) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Project not found",
            });
        }

        // get code sets + count of codes
        const codeSets = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
                label: projectCodeSet.label,
                status: projectCodeSet.status,
                storePlaintext: projectCodeSet.storePlaintext,
                maxClaimsPerCode: projectCodeSet.maxClaimsPerCode,
                expiresAt: projectCodeSet.expiresAt,
                createdAt: projectCodeSet.createdAt,
                createdByUserId: projectCodeSet.createdByUserId,
                codeCount: count(projectAccessCode.id).as("code_count"),
            })
            .from(projectCodeSet)
            .leftJoin(projectAccessCode, eq(projectAccessCode.codeSetId, projectCodeSet.id))
            .where(eq(projectCodeSet.projectId, projectId))
            .groupBy(projectCodeSet.id)
            .orderBy(desc(projectCodeSet.createdAt));

        return codeSets;
    }),

    // get code set by id
    getCodeSetById: protectedProcedure.input(z.object({
        id: z.string(),
    })).query(async ({ input, ctx }) => {
        const { id } = input;
        const userId = ctx.user.id;

        logger.info(`Getting code set ${id} by user ${userId}`);

        // get code set by id and verify user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
                label: projectCodeSet.label,
                status: projectCodeSet.status,
                storePlaintext: projectCodeSet.storePlaintext,
                maxClaimsPerCode: projectCodeSet.maxClaimsPerCode,
                expiresAt: projectCodeSet.expiresAt,
                createdAt: projectCodeSet.createdAt,
                createdByUserId: projectCodeSet.createdByUserId,
                codeCount: count(projectAccessCode.id).as("code_count"),
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .leftJoin(projectAccessCode, eq(projectAccessCode.codeSetId, projectCodeSet.id))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ))
            .groupBy(projectCodeSet.id);

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        return codeSet;
    }),

    // update code set
    updateCodeSet: protectedProcedure.input(z.object({
        id: z.string(),
        label: z.string().min(1).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        maxClaimsPerCode: z.number().int().positive().nullable().optional(),
        expiresAt: z.date().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
        const { id, label, status, maxClaimsPerCode, expiresAt } = input;
        const userId = ctx.user.id;

        logger.info(`Updating code set ${id} by user ${userId}`);

        // check project and user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        // Build update object with only provided fields
        const updateData: Partial<typeof projectCodeSet.$inferInsert> = {};
        if (label !== undefined) updateData.label = label;
        if (status !== undefined) updateData.status = status;
        if (maxClaimsPerCode !== undefined) updateData.maxClaimsPerCode = maxClaimsPerCode;
        if (expiresAt !== undefined) updateData.expiresAt = expiresAt;

        if (Object.keys(updateData).length === 0) {
            throw new TRPCError({
                code: TRPCErrorCodes.BAD_REQUEST,
                message: "No fields to update",
            });
        }

        try {
            // update code set
            const [updatedCodeSet] = await db
                .update(projectCodeSet)
                .set(updateData)
                .where(eq(projectCodeSet.id, id))
                .returning();

            // Check if code set was deleted between ownership check and update
            if (!updatedCodeSet) {
                throw new TRPCError({
                    code: TRPCErrorCodes.NOT_FOUND,
                    message: "Code set not found or was deleted",
                });
            }

            // update project updatedAt
            await db
                .update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, codeSet.projectId));

            logger.info(`Successfully updated code set ${id}`);

            return updatedCodeSet;
        } catch (error) {
            // Re-throw TRPCErrors as-is to preserve their error codes
            if (error instanceof TRPCError) {
                throw error;
            }
            logger.error(`Failed to update code set: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: "Failed to update code set",
            });
        }
    }),

    // delete code set
    deleteCodeSet: protectedProcedure.input(z.object({
        id: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const { id } = input;
        const userId = ctx.user.id;

        logger.info(`Deleting code set ${id} by user ${userId}`);

        // check project and user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        try {
            // delete code set (cascade will delete related codes and claims)
            await db
                .delete(projectCodeSet)
                .where(eq(projectCodeSet.id, id));

            // update project updatedAt
            await db
                .update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, codeSet.projectId));

            logger.info(`Successfully deleted code set ${id}`);

            return { success: true };
        } catch (error) {
            logger.error(`Failed to delete code set: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: "Failed to delete code set",
            });
        }
    }),

    // add codes to code set
    addCodesToCodeSet: protectedProcedure.input(z.object({
        id: z.string(),
        codes: z.array(z.string().min(1)).min(1, "At least one code is required"),
    })).mutation(async ({ input, ctx }) => {
        const { id, codes } = input;
        const userId = ctx.user.id;

        logger.info(`Adding ${codes.length} codes to code set ${id} by user ${userId}`);

        // check project and user owns the project, and get storePlaintext setting
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
                storePlaintext: projectCodeSet.storePlaintext,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        // Remove duplicates from input
        const uniqueCodes = [...new Set(codes)];

        // Hash codes if storePlaintext is false
        const processedCodes = uniqueCodes.map(code =>
            codeSet.storePlaintext ? code : hashCode(code)
        );

        try {
            // add codes to code set (use insert with onConflictDoNothing to handle duplicates)
            const insertedCodes = await db
                .insert(projectAccessCode)
                .values(
                    processedCodes.map(codeValue => ({
                        codeSetId: id,
                        codeValue,
                    }))
                )
                .onConflictDoNothing()
                .returning();

            // update project updatedAt
            await db
                .update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, codeSet.projectId));

            logger.info(`Successfully added ${insertedCodes.length} codes to code set ${id}${codeSet.storePlaintext ? "" : " (hashed)"}`);

            return {
                added: insertedCodes.length,
                skipped: uniqueCodes.length - insertedCodes.length,
                codes: insertedCodes,
            };
        } catch (error) {
            logger.error(`Failed to add codes to code set: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: "Failed to add codes to code set",
            });
        }
    }),

    // remove codes from code set
    removeCodesFromCodeSet: protectedProcedure.input(z.object({
        id: z.string(),
        codeIds: z.array(z.string()).min(1, "At least one code ID is required"),
    })).mutation(async ({ input, ctx }) => {
        const { id, codeIds } = input;
        const userId = ctx.user.id;

        logger.info(`Removing ${codeIds.length} codes from code set ${id} by user ${userId}`);

        // check project and user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        try {
            // remove codes from code set
            const deletedCodes = await db
                .delete(projectAccessCode)
                .where(and(
                    eq(projectAccessCode.codeSetId, id),
                    inArray(projectAccessCode.id, codeIds)
                ))
                .returning();

            // update project updatedAt
            await db
                .update(project)
                .set({ updatedAt: new Date() })
                .where(eq(project.id, codeSet.projectId));

            logger.info(`Successfully removed ${deletedCodes.length} codes from code set ${id}`);

            return {
                removed: deletedCodes.length,
            };
        } catch (error) {
            logger.error(`Failed to remove codes from code set: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: "Failed to remove codes from code set",
            });
        }
    }),

    // get codes for code set (paginated)
    getCodesForCodeSet: protectedProcedure.input(paginationSchema.extend({
        id: z.string(),
    })).query(async ({ input, ctx }) => {
        const { id, page, limit } = input;
        const userId = ctx.user.id;

        logger.info(`Getting codes for code set ${id} by user ${userId} (page ${page}, limit ${limit})`);

        // check project and user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        const offset = (page - 1) * limit;

        // get codes for code set with claim counts
        const [totalCountResult, items] = await Promise.all([
            db.select({ total: count() })
                .from(projectAccessCode)
                .where(eq(projectAccessCode.codeSetId, id)),
            db.select({
                id: projectAccessCode.id,
                codeSetId: projectAccessCode.codeSetId,
                codeValue: projectAccessCode.codeValue,
                status: projectAccessCode.status,
                createdAt: projectAccessCode.createdAt,
                claimCount: count(projectCodeClaim.id).as("claim_count"),
            })
                .from(projectAccessCode)
                .leftJoin(projectCodeClaim, eq(projectCodeClaim.codeId, projectAccessCode.id))
                .where(eq(projectAccessCode.codeSetId, id))
                .groupBy(projectAccessCode.id)
                .orderBy(desc(projectAccessCode.createdAt))
                .limit(limit)
                .offset(offset),
        ]);

        const totalCount = totalCountResult && totalCountResult.length > 0 ? totalCountResult[0].total : 0;
        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = totalPages === 0 ? 0 : Math.min(Math.max(1, page), totalPages);

        const hasNextPage = totalCount > offset + limit;
        const hasPreviousPage = currentPage > 1;

        return {
            totalCount,
            totalPages,
            currentPage,
            items,
            hasNextPage,
            hasPreviousPage,
        };
    }),


    // get code set claims by code set id (paginated)
    getCodeSetClaims: protectedProcedure.input(paginationSchema.extend({
        id: z.string(),
    })).query(async ({ input, ctx }) => {
        const { id, page, limit } = input;
        const userId = ctx.user.id;

        logger.info(`Getting claims for code set ${id} by user ${userId} (page ${page}, limit ${limit})`);

        // check project and user owns the project
        const [codeSet] = await db
            .select({
                id: projectCodeSet.id,
                projectId: projectCodeSet.projectId,
            })
            .from(projectCodeSet)
            .innerJoin(project, eq(project.id, projectCodeSet.projectId))
            .where(and(
                eq(projectCodeSet.id, id),
                eq(project.ownerId, userId)
            ));

        if (!codeSet) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: "Code set not found",
            });
        }

        const offset = (page - 1) * limit;

        // get code set claims by code set id
        const [totalCountResult, items] = await Promise.all([
            db.select({ total: count() })
                .from(projectCodeClaim)
                .innerJoin(projectAccessCode, eq(projectAccessCode.id, projectCodeClaim.codeId))
                .where(eq(projectAccessCode.codeSetId, id)),
            db.select({
                id: projectCodeClaim.id,
                codeId: projectCodeClaim.codeId,
                codeValue: projectAccessCode.codeValue,
                projectParticipantId: projectCodeClaim.projectParticipantId,
                claimedAt: projectCodeClaim.claimedAt,
            })
                .from(projectCodeClaim)
                .innerJoin(projectAccessCode, eq(projectAccessCode.id, projectCodeClaim.codeId))
                .where(eq(projectAccessCode.codeSetId, id))
                .orderBy(desc(projectCodeClaim.claimedAt))
                .limit(limit)
                .offset(offset),
        ]);

        const totalCount = totalCountResult && totalCountResult.length > 0 ? totalCountResult[0].total : 0;
        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = totalPages === 0 ? 0 : Math.min(Math.max(1, page), totalPages);

        const hasNextPage = totalCount > offset + limit;
        const hasPreviousPage = currentPage > 1;

        return {
            totalCount,
            totalPages,
            currentPage,
            items,
            hasNextPage,
            hasPreviousPage,
        };
    }),
});

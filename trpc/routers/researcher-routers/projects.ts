import { researcherAuthProcedure as protectedProcedure, router } from '../../init';
import { z } from 'zod';

import logger from '@/lib/logger';
import { TRPCError } from '@trpc/server';
import { TRPCErrorCodes } from '../../utils';
import { paginationSchema } from '../utils';
import { db } from '@/lib/drizzle-db';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { project } from '@/lib/db/schema/projects';


export const projectsRouter = router({
    getProjects: protectedProcedure.input(
        paginationSchema.extend({
            search: z.string().optional(),
        })
    ).query(async ({ input, ctx }) => {
        const { page, limit, search } = input;
        const userId = ctx.user.id;

        logger.info('Getting projects for user: ' + userId + ' with search: ' + search + ' and page: ' + page + ' and limit: ' + limit);

        const ownerFilter = eq(project.ownerId, userId);
        const conditions = [ownerFilter];

        if (search) {
            conditions.push(ilike(project.name, `%${search}%`));
        }

        const whereClause = and(...conditions);

        // Get paginated projects
        const offset = (page - 1) * limit;

        const [totalCountForOwner, totalCountForSearch, items] = await Promise.all([
            db.select({ total: count() })
                .from(project)
                .where(ownerFilter),
            db.select({ total: count() })
                .from(project)
                .where(whereClause),
            db.select()
                .from(project)
                .where(whereClause)
                .orderBy(desc(project.updatedAt))
                .limit(limit)
                .offset(offset),
        ]);

        const countForSearch = totalCountForSearch && totalCountForSearch.length > 0 ? totalCountForSearch[0].total : 0;
        const totalPages = Math.ceil(countForSearch / limit);

        // Clamp currentPage to valid range: if no pages exist, return 0; otherwise clamp between 1 and totalPages
        const currentPage = totalPages === 0 ? 0 : Math.min(Math.max(1, page), totalPages);

        const hasNextPage = countForSearch > offset + limit;
        const hasPreviousPage = currentPage > 1;

        return {
            totalCount: countForSearch,
            totalCountForOwner: totalCountForOwner && totalCountForOwner.length > 0 ? totalCountForOwner[0].total : 0,
            totalPages: totalPages,
            currentPage,
            items,
            hasNextPage,
            hasPreviousPage,
        };
    }),

    getProject: protectedProcedure.input(z.object({
        id: z.string(),
    })).query(async ({ input, ctx }) => {
        const userId = ctx.user.id;

        logger.info('Getting project for user: ' + userId + ' with id: ' + input.id);

        const whereClause = and(
            eq(project.id, input.id), eq(project.ownerId, userId));

        const [result] = await db.select().from(project).where(whereClause);

        if (!result) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        return result;
    }),

    createProject: protectedProcedure.input(z.object({
        name: z.string().min(1, 'Project name is required'),
    })).mutation(async ({ input, ctx }) => {
        const userId = ctx.user.id;

        logger.info(`Creating project for user ${userId} with name: ${input.name}`);

        try {
            const [createdProject] = await db
                .insert(project)
                .values({
                    name: input.name,
                    ownerId: userId,
                })
                .returning();

            logger.info(`Successfully created project ${createdProject.id}`);

            return createdProject;
        } catch (error) {
            logger.error(`Failed to create project: ${error}`);
            throw new TRPCError({
                code: TRPCErrorCodes.INTERNAL_SERVER_ERROR,
                message: 'Failed to create project',
            });
        }
    }),

    updateProjectName: protectedProcedure.input(z.object({
        id: z.string(),
        name: z.string().min(1, 'Project name is required'),
    })).mutation(async ({ input, ctx }) => {
        const userId = ctx.user.id;

        logger.info(`Updating project name for user ${userId} with id: ${input.id} and name: ${input.name}`);

        const whereClause = and(
            eq(project.id, input.id), eq(project.ownerId, userId));

        const [result] = await db
            .update(project)
            .set({ name: input.name })
            .where(whereClause)
            .returning();

        if (!result) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        return result;
    }),

    deleteProject: protectedProcedure.input(z.object({
        id: z.string(),
    })).mutation(async ({ input, ctx }) => {
        const userId = ctx.user.id;

        logger.info(`Deleting project for user ${userId} with id: ${input.id}`);

        const whereClause = and(
            eq(project.id, input.id), eq(project.ownerId, userId));

        const [result] = await db.delete(project).where(whereClause).returning();

        if (!result) {
            throw new TRPCError({
                code: TRPCErrorCodes.NOT_FOUND,
                message: 'Project not found',
            });
        }

        return result;
    }),

});

import { project } from "@/lib/db/schema/projects";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle-db";

export const projectBelongsToUserCheck = async (projectId: string, userId: string) => {
    const projectBelongsToUser = and(
        eq(project.ownerId, userId),
        eq(project.id, projectId)
    );
    const projectExists = await db.select().from(project).where(projectBelongsToUser);
    return projectExists.length > 0;
}
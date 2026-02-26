import { z } from "zod";

export const paginationSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(1000).default(50),
});
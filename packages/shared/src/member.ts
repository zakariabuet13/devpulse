import { z } from "zod";
import {
  atLeastOneKey,
  atLeastOneKeyMessage,
  paginated,
  paginationQuerySchema,
} from "./common";

const memberName = z.string().trim().min(1).max(100);

// GitHub login: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const githubLogin = z.string().regex(/^(?!-)(?!.*--)(?!.*-$)[A-Za-z0-9-]{1,39}$/);

export const memberSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  githubLogin: z.string(),
});

export type Member = z.infer<typeof memberSchema>;

export const createMemberSchema = z.object({
  name: memberName,
  githubLogin,
});

export type CreateMember = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    name: memberName.optional(),
    githubLogin: githubLogin.optional(),
    teamId: z.string().min(1).optional(),
  })
  .strict()
  .refine(atLeastOneKey, atLeastOneKeyMessage);

export type UpdateMember = z.infer<typeof updateMemberSchema>;

// Blank/whitespace `q` is trimmed to "" and treated as no filter by the route.
export const memberListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberPageSchema = paginated(memberSchema);

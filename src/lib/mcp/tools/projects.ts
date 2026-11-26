import type { McpToolDefinition } from "@/lib/mcp/types";
import { createProjectSchema, createGroupSchema, createGroupAndNotify, gkCreateProject, listGroups } from "@/lib/projects/service";
import {
  addProjectMemberSchema,
  gkAddProjectMember,
  gkRemoveProjectMember,
  gkSetProjectMemberAccess,
  listAddableMembers,
  listProjectMembers,
  removeProjectMemberSchema,
  setProjectMemberAccessSchema,
} from "@/lib/projects/members";
import { assertProjectAccess, canSeeAllProjects } from "@/lib/projects/access";
import { z } from "zod";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const projectTools: McpToolDefinition[] = [
  {
    name: "projects.list",
    description: "List groups with their projects.",
    inputSchema: createGroupSchema.partial().transform(() => ({})),
    requiredPageKey: "projects",
    accessLevel: "READ",
    async handler(ctx) {
      const seeAll = await canSeeAllProjects(ctx.db, ctx.userId, ctx.companyId);
      return dataResult({ groups: await listGroups(ctx.db, ctx.companyId, seeAll ? undefined : ctx.userId) });
    },
  },
  {
    name: "projects.create_group",
    description: "Create a project group.",
    inputSchema: createGroupSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const group = await createGroupAndNotify(ctx.db, ctx.companyId, ctx.userId, (input as { name: string }).name);
      return commitResult(group);
    },
  },
  {
    name: "projects.create_project",
    description: "Create a project with a starter task list and core apps.",
    inputSchema: createProjectSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      const project = await gkCreateProject(ctx.db, ctx.companyId, ctx.userId, input as never);
      return commitResult(project);
    },
  },
  {
    name: "projects.list_members",
    description: "List project members and workspace members not yet added.",
    inputSchema: z.object({ projectId: z.coerce.number().int().positive() }),
    requiredPageKey: "projects",
    accessLevel: "READ",
    async handler(ctx, input) {
      const { projectId } = input as { projectId: number };
      await assertProjectAccess(ctx.db, ctx.companyId, ctx.userId, projectId);
      const [members, addable] = await Promise.all([
        listProjectMembers(ctx.db, ctx.companyId, projectId),
        listAddableMembers(ctx.db, ctx.companyId, projectId),
      ]);
      return dataResult({ members, addable });
    },
  },
  {
    name: "projects.add_member",
    description: "Add a workspace member to a project. Project membership controls who can see its tasks, documents and files.",
    inputSchema: addProjectMemberSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkAddProjectMember(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
  {
    name: "projects.set_member_access",
    description: "Override a project member's access: INHERIT, READ_ONLY, COMMENT or READ_WRITE.",
    inputSchema: setProjectMemberAccessSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkSetProjectMemberAccess(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
  {
    name: "projects.remove_member",
    description: "Remove a member from a project. The project owner cannot be removed.",
    inputSchema: removeProjectMemberSchema,
    requiredPageKey: "projects",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkRemoveProjectMember(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
];

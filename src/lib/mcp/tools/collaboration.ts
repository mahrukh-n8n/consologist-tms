import type { McpToolDefinition } from "@/lib/mcp/types";
import { createDiscussionSchema, gkCreateDiscussion, listDiscussions } from "@/lib/discussions/service";
import { createEventSchema, gkCreateEvent, listEvents } from "@/lib/calendar/service";
import { createTimeSchema, gkCreateTimeRecord, listTimeRecords } from "@/lib/time/service";
import { gkSendChat, listChat, sendChatSchema } from "@/lib/chat/service";
import { getPaginatedNotifications, markAllAsRead } from "@/lib/notifications/service";
import { commitResult, dataResult } from "@/modules/mcp/utils/serialize";

export const collaborationTools: McpToolDefinition[] = [
  {
    name: "discussions.list",
    description: "List discussions, optionally for one project.",
    inputSchema: createDiscussionSchema.pick({ projectId: true }).partial().transform(() => ({})),
    requiredPageKey: "discussions",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ discussions: await listDiscussions(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "discussions.create",
    description: "Create a discussion.",
    inputSchema: createDiscussionSchema,
    requiredPageKey: "discussions",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkCreateDiscussion(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
  {
    name: "calendar.list",
    description: "List calendar events.",
    inputSchema: createEventSchema.pick({ projectId: true }).partial().transform(() => ({})),
    requiredPageKey: "dashboard-calendar",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ events: await listEvents(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "calendar.create",
    description: "Create a calendar event.",
    inputSchema: createEventSchema,
    requiredPageKey: "dashboard-calendar",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkCreateEvent(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
  {
    name: "time.list",
    description: "List the caller's time records.",
    inputSchema: createTimeSchema.partial().transform(() => ({})),
    requiredPageKey: "dashboard-time",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ records: await listTimeRecords(ctx.db, ctx.companyId, ctx.userId) });
    },
  },
  {
    name: "time.create",
    description: "Log a time record.",
    inputSchema: createTimeSchema,
    requiredPageKey: "dashboard-time",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkCreateTimeRecord(ctx.db, ctx.companyId, ctx.userId, input as never));
    },
  },
  {
    name: "chat.list",
    description: "List recent workspace chat messages.",
    inputSchema: sendChatSchema.partial().transform(() => ({})),
    requiredPageKey: "chat",
    accessLevel: "READ",
    async handler(ctx) {
      return dataResult({ messages: await listChat(ctx.db, ctx.companyId) });
    },
  },
  {
    name: "chat.send",
    description: "Send a workspace chat message.",
    inputSchema: sendChatSchema,
    requiredPageKey: "chat",
    accessLevel: "WRITE",
    async handler(ctx, input) {
      return commitResult(await gkSendChat(ctx.db, ctx.companyId, ctx.userId, (input as { body: string }).body));
    },
  },
  {
    name: "notifications.list",
    description: "List the caller's notifications.",
    inputSchema: sendChatSchema.partial().transform(() => ({})),
    requiredPageKey: "notifications",
    accessLevel: "READ",
    async handler(ctx) {
      const result = await getPaginatedNotifications(ctx.userId, ctx.companyId, { page: 1, limit: 50 });
      return dataResult(result);
    },
  },
  {
    name: "notifications.mark_read",
    description: "Mark all of the caller's notifications read.",
    inputSchema: sendChatSchema.partial().transform(() => ({})),
    requiredPageKey: "notifications",
    accessLevel: "WRITE",
    async handler(ctx) {
      await markAllAsRead(ctx.userId, ctx.companyId);
      return commitResult({ marked: true });
    },
  },
];

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const sendChatSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export function listChat(db: PrismaClient, companyId: number) {
  return db.chatMessage.findMany({
    where: { companyId },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function gkSendChat(db: PrismaClient, companyId: number, userId: number, body: string) {
  return db.chatMessage.create({ data: { companyId, userId, body } });
}

"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { gkSendChat, sendChatSchema } from "@/lib/chat/service";

export type ActionState = { success: boolean; error?: string };
export async function sendChatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "chat");
    const parsed = sendChatSchema.safeParse({ body: formData.get("body") });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "chat.send", pageKey: "chat", payload: parsed.data, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkSendChat(prisma, company.id, user.id, parsed.data.body);
    revalidatePath("/chat");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Message failed." }; }
}

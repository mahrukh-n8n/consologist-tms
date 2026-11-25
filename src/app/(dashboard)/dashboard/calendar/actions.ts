"use server";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { requireWriteGate } from "@/modules/auth-rbac/middleware/page-access";
import { createEventSchema, gkCreateEvent } from "@/lib/calendar/service";

export type ActionState = { success: boolean; error?: string };
export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, company } = await requireCompany();
  try {
    const gate = await requireWriteGate(user.id, company.id, "dashboard-calendar");
    const parsed = createEventSchema.safeParse({
      projectId: formData.get("projectId"), title: formData.get("title"), description: formData.get("description") ?? "",
      startAt: formData.get("startAt"), endAt: formData.get("endAt") || undefined, allDay: formData.get("allDay") === "on",
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid event." };
    if (gate.needsApproval) {
      await prisma.pendingApproval.create({
        data: { companyId: company.id, entityType: "calendar.create", pageKey: "dashboard-calendar", payload: parsed.data, displayPayload: { title: parsed.data.title }, submittedBy: user.id },
      });
      return { success: true };
    }
    await gkCreateEvent(prisma, company.id, user.id, parsed.data);
    revalidatePath("/dashboard/calendar");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Event failed." }; }
}

import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getActiveCompany } from "@/lib/company/get-active-company";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user } = await requireAuth();
  const company = await getActiveCompany(user.id);
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const attachment = await prisma.documentAttachment.findFirst({
    where: { id, document: { project: { group: { companyId: company.id } } } },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!attachment) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.fileName.replaceAll('"', "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

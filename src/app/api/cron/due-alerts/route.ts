import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { runDueAlerts } from "@/lib/notifications/email-alerts";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDueAlerts(getPrisma());
  return NextResponse.json(result);
}

export const POST = GET;

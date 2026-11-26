import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { runDailyDigests } from "@/lib/notifications/email-alerts";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runDailyDigests(getPrisma()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Daily digest failed." }, { status: 500 });
  }
}

export const POST = GET;

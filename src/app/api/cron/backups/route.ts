import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { runDueSchedules } from "@/lib/backup/schedule";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ results: await runDueSchedules(getPrisma()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled backup failed." }, { status: 500 });
  }
}

export const POST = GET;

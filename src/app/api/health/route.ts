/**
 * GET /api/health — unauthenticated liveness/readiness probe for Docker,
 * load balancers and uptime monitors. Checks database connectivity.
 */
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  const started = Date.now();
  let database: { status: "ok" | "error"; latencyMs: number; error?: string };
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    database = { status: "ok", latencyMs: Date.now() - started };
  } catch (error) {
    database = {
      status: "error",
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "database check failed",
    };
  }

  const healthy = database.status === "ok";
  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      checks: { database },
      version: process.env.APP_VERSION ?? "1.0.0",
    },
    { status: healthy ? 200 : 503 }
  );
}

import "dotenv/config";
import { getPrisma, runMcpReadOnly } from "@/lib/db";
import { registerMcpTools } from "@/lib/mcp/register-tools";
import {
  createApiKeyValidator,
  permissionChecker,
  approvalRouter,
  auditWriter,
} from "@/lib/mcp/callbacks";
import { createMcpServer, startStdioTransport, toolRegistry } from "@/modules/mcp";

async function main() {
  const rawKey = process.env.MCP_API_KEY;
  const companyId = Number(process.env.MCP_COMPANY_ID);
  if (!rawKey) throw new Error("MCP_API_KEY is required.");
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("MCP_COMPANY_ID must be a positive integer.");

  const db = getPrisma();
  registerMcpTools();

  const apiKeyValidator = createApiKeyValidator(db);
  const session = await apiKeyValidator(rawKey, companyId);

  const server = createMcpServer(
    { userId: session.userId, companyId: session.companyId, requestId: crypto.randomUUID() },
    toolRegistry,
    {
      db,
      runReadOnlyTool: (_toolName, handler) => runMcpReadOnly(handler),
      apiKeyValidator,
      permissionChecker,
      approvalRouter,
      auditWriter,
    }
  );

  await startStdioTransport(server);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

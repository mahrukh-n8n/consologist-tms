import type { McpToolDefinition } from "@/lib/mcp/types";
import { errorResult } from "@/modules/mcp/utils/serialize";

/** Keep the definition available while denying MCP execution, including admin calls. */
export function guiOnlyTool(tool: McpToolDefinition): McpToolDefinition {
  return {
    ...tool,
    description: `MCP ACCESS BLOCKED — use Tools → Buy-Side Corrections in the GUI. ${tool.description}`,
    async handler() {
      return errorResult(
        "This admin repair workflow is GUI-only. Open Tools → Buy-Side Corrections. MCP access is blocked, including preview and audit calls.",
        "GUI_ONLY",
      );
    },
  };
}

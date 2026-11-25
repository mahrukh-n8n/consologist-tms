import { registerAppPages } from "@/lib/auth/page-definitions";
import { pageRegistry } from "@/modules/auth-rbac/registry";
import { toolRegistry } from "@/modules/mcp";
import { taskTools } from "./tools/tasks";
import { taskFileTools } from "./tools/task-files";
import { backupTools } from "./tools/backups";
import { userTools } from "./tools/users";
import { accountTools } from "./tools/account";
import { projectTools } from "./tools/projects";
import { collaborationTools } from "./tools/collaboration";
import { fileTools } from "./tools/files";
import { tagTools } from "./tools/tags";
import { permissionTools } from "./tools/permissions";
import { documentTools } from "./tools/documents";
import { statusTools } from "./tools/statuses";

let registered = false;

/** Single registration file for all app-side MCP tools. Idempotent. */
export function registerMcpTools(): void {
  if (registered || toolRegistry.isFrozen()) return;
  registerAppPages();
  if (!pageRegistry.isFrozen()) pageRegistry.freeze();

  for (const tool of [
    ...taskTools, ...taskFileTools, ...backupTools, ...userTools, ...accountTools,
    ...projectTools, ...collaborationTools, ...fileTools, ...tagTools, ...permissionTools, ...documentTools, ...statusTools,
  ]) {
    if (!pageRegistry.getPageByKey(tool.requiredPageKey)) {
      throw new Error(`MCP tool "${tool.name}" uses unknown page key "${tool.requiredPageKey}".`);
    }
    toolRegistry.register(tool);
  }

  toolRegistry.freeze();
  registered = true;
}

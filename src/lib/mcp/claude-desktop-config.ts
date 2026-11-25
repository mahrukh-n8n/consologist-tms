export interface ClaudeDesktopConfigTemplate {
  mcpServers: {
    consologist_accountant: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
}

export interface ClaudeDesktopConfigInput {
  companyId: number;
  command?: string;
  args?: string[];
  databaseUrlPlaceholder?: string;
}

export function buildClaudeDesktopConfig(
  input: ClaudeDesktopConfigInput
): ClaudeDesktopConfigTemplate {
  const command = input.command ?? "npx";
  const args = input.args ?? ["tsx", "scripts/mcp-server.ts"];

  return {
    mcpServers: {
      consologist_accountant: {
        command,
        args,
        env: {
          DATABASE_URL: input.databaseUrlPlaceholder ?? "postgresql://YOUR_DB_CONNECTION_STRING",
          MCP_API_KEY: "PASTE_NEWLY_CREATED_KEY_HERE",
          MCP_COMPANY_ID: String(input.companyId),
        },
      },
    },
  };
}

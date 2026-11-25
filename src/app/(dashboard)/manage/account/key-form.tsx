"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifications/client";
import { createMcpKeyAction, type KeyState } from "./actions";

export function McpKeyForm({ appUrl, companyId }: { appUrl: string; companyId: number }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(createMcpKeyAction, {
    success: false,
  });

  useEffect(() => {
    if (state.error) notify.error("API key not created", state.error, "mcp-key");
    if (state.success) notify.success("API key created", "Copy it now — it is shown once.", "mcp-key");
  }, [state]);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" placeholder="Claude Desktop" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create API key"}</Button>
      </form>
      {state.rawKey ? (
        <div className="space-y-3 rounded-xl border-2 border-ink bg-muted p-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Copy this key now</p>
            <code className="break-all text-sm">{state.rawKey}</code>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-extrabold uppercase">HTTP MCP</p>
            <p className="text-muted-foreground">Endpoint</p>
            <code className="block break-all rounded-md bg-card p-2">{appUrl || "https://your-app"}/api/mcp</code>
            <p className="text-muted-foreground">Header</p>
            <code className="block break-all rounded-md bg-card p-2">x-api-key: {state.rawKey}</code>
            <p className="text-muted-foreground">Claude Code</p>
            <code className="block break-all rounded-md bg-card p-2">
              {`claude mcp add --transport http consologist-tms ${appUrl || "https://your-app"}/api/mcp --header "x-api-key: ${state.rawKey}"`}
            </code>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-extrabold uppercase">stdio MCP</p>
            <code className="block whitespace-pre-wrap break-all rounded-md bg-card p-2">
{`{
  "mcpServers": {
    "consologist_tms": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "env": {
        "DATABASE_URL": "<same database URL as the app>",
        "MCP_API_KEY": "${state.rawKey}",
        "MCP_COMPANY_ID": "${companyId}"
      }
    }
  }
}`}
            </code>
          </div>

          <p className="text-xs text-muted-foreground">
            Writes stay off until you enable them above. HTTP sessions expire after 24 hours.
          </p>
        </div>
      ) : null}
    </div>
  );
}

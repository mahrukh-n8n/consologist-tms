import { requireCompany } from "@/lib/company/require-company";
import { prisma } from "@/lib/db";
import { listChat } from "@/lib/chat/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyForm } from "@/components/ui/notify-form";
import { sendChatAction } from "./actions";

export default async function ChatPage() {
  const { company } = await requireCompany();
  const messages = (await listChat(prisma, company.id)).reverse();
  return (
    <div className="section-gap">
      <h1 className="page-title">Chat</h1>
      <Card><CardHeader><CardTitle>Message</CardTitle></CardHeader><CardContent>
        <NotifyForm action={sendChatAction} actionId="chat-send" submitLabel="Send" successTitle="Message sent" errorTitle="Message not sent" className="flex items-end gap-2"
          fields={[{ kind: "text", name: "body", label: "Message", required: true, className: "min-w-0 flex-1 space-y-1" }]} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Conversation ({messages.length})</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {messages.length === 0 ? <p className="text-muted-foreground">No messages.</p> : messages.map((m) => (
          <div key={m.id} className="rounded-xl border-2 border-ink bg-card p-2 shadow-[2px_2px_0_var(--ink)]">
            <p className="text-xs text-muted-foreground">{m.user.fullName} · {m.createdAt.toISOString().slice(11,16)}</p>
            <p>{m.body}</p>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}

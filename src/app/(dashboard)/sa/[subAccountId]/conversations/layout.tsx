import { ConversationWorkspace } from "@/components/conversations/conversation-workspace";

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  return <><ConversationWorkspace />{children}</>;
}

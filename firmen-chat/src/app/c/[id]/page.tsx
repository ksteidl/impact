import { redirect } from "next/navigation"
import { ChatApp } from "@/components/chat/chat-app"
import { loadChatPage } from "@/server/chat-page"

export default async function ConversationPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params
  const data = await loadChatPage(id)
  if (!data.initial) redirect("/")
  return <ChatApp key={id} {...data} />
}

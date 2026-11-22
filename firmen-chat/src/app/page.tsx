import { ChatApp } from "@/components/chat/chat-app"
import { loadChatPage } from "@/server/chat-page"

export default async function Home() {
  const data = await loadChatPage()
  return <ChatApp {...data} />
}

import "server-only"
import { cookies } from "next/headers"
import { all, get, getSetting } from "./db"
import { requirePageUser } from "./http"
import { conversationsFor, meFor, modelsForUser, publicModel } from "./services"
import type { ChatMessage } from "@/lib/types"

/** Lädt alles, was die Chat-Oberfläche beim ersten Rendern braucht. */
export async function loadChatPage(conversationId?: string) {
  const user = await requirePageUser()
  const storeChats = getSetting("store_chats") === "1"
  let initial: { id: string; model_ref: number | null; messages: ChatMessage[] } | null = null
  if (conversationId && storeChats) {
    const conv = get<{ id: string; model_ref: number | null }>(
      "SELECT id, model_ref FROM conversations WHERE id = ? AND user_id = ?",
      conversationId,
      user.id
    )
    if (conv) {
      initial = {
        ...conv,
        messages: all<ChatMessage>(
          "SELECT role, content, model_label FROM messages WHERE conversation_id = ? ORDER BY id",
          conv.id
        ),
      }
    }
  }
  return {
    me: meFor(user),
    models: modelsForUser(user).map(publicModel),
    conversations: storeChats ? conversationsFor(user.id) : [],
    initial,
    preferredModel: Number((await cookies()).get("fc_model")?.value) || null,
  }
}

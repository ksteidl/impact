// Gemeinsame Typen für Client-Komponenten (spiegeln die API-Antworten).
export type ProviderType = "anthropic" | "openai" | "azure" | "openai-compatible"

export type Me = {
  id: number
  username: string
  displayName: string
  role: "user" | "admin"
  department: string
  storeChats: boolean
  retentionDays: number
  bannerText: string
  usageToday: number
  dailyLimit: number
}

export type ChatModel = {
  id: number
  name: string
  description: string
  provider: string
  providerType: ProviderType
  local: boolean
}

export type ConversationSummary = { id: string; title: string; model_ref: number | null; updated_at: number }

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
  model_label?: string
  notes?: string[]
  redactions?: number
  error?: boolean
}

import "server-only"
// Anbieter-Adapter. Zwei Protokolle decken praktisch alle aktuellen Modelle ab:
//  - "anthropic": Claude über die offizielle Anthropic-SDK (Messages API)
//  - "openai" / "azure" / "openai-compatible": OpenAI-SDK (Chat Completions).
//    Darüber laufen auch Google Gemini, Mistral, xAI, DeepSeek, Groq, OpenRouter,
//    Together, Perplexity sowie lokale Server wie Ollama, vLLM oder LM Studio.
import Anthropic from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import { decrypt } from "./security"

export type ProviderType = "anthropic" | "openai" | "azure" | "openai-compatible"

export type ProviderRow = {
  id: number
  name: string
  type: ProviderType
  base_url: string
  api_key_enc: string
  options_json: string
  is_local: number
  enabled: number
}

export type ModelConfig = { model_id: string; max_tokens: number | null; effort: string }
export type ChatMessage = { role: "user" | "assistant"; content: string }
export type StreamResult = { inputTokens: number; outputTokens: number; notice?: string }

// Claude-Modelle mit serverseitigem Refusal-Fallback: lehnt das Modell eine Anfrage
// aus Sicherheitsgründen ab, beantwortet die API sie mit einem passenden Ersatzmodell.
const FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
])

function options(p: ProviderRow): { apiVersion?: string } {
  try {
    return JSON.parse(p.options_json || "{}")
  } catch {
    return {}
  }
}

function anthropicClient(p: ProviderRow) {
  return new Anthropic({ apiKey: decrypt(p.api_key_enc), baseURL: p.base_url || undefined, maxRetries: 2 })
}

function openaiClient(p: ProviderRow, deployment?: string) {
  if (p.type === "azure") {
    return new AzureOpenAI({
      apiKey: decrypt(p.api_key_enc),
      endpoint: p.base_url,
      apiVersion: options(p).apiVersion || "2024-10-21",
      deployment,
      maxRetries: 2,
    })
  }
  // Lokale Server (Ollama, vLLM …) brauchen oft keinen Schlüssel.
  return new OpenAI({ apiKey: decrypt(p.api_key_enc) || "kein-schluessel", baseURL: p.base_url || undefined, maxRetries: 2 })
}

// Aufeinanderfolgende Nachrichten derselben Rolle zusammenführen (z. B. nach einer
// fehlgeschlagenen Antwort) – nicht jede API akzeptiert das.
function normalize(messages: ChatMessage[]) {
  const out: ChatMessage[] = []
  for (const m of messages) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += `\n\n${m.content}`
    else out.push({ role: m.role, content: m.content })
  }
  while (out.length && out[0].role !== "user") out.shift()
  return out
}

type StreamArgs = {
  provider: ProviderRow
  model: ModelConfig
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
  onText: (t: string) => void
}

export async function streamChat(args: StreamArgs): Promise<StreamResult> {
  const msgs = normalize(args.messages)
  return args.provider.type === "anthropic" ? streamAnthropic(args, msgs) : streamOpenAI(args, msgs)
}

async function streamAnthropic({ provider, model, system, signal, onText }: StreamArgs, msgs: ChatMessage[]) {
  const client = anthropicClient(provider)
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: model.model_id,
    max_tokens: model.max_tokens || 32000,
    messages: msgs,
  }
  if (system) params.system = system
  if (model.effort) Object.assign(params, { output_config: { effort: model.effort } })

  // Fallback nur bei direkter Anbindung an Anthropic (nicht über Gateways mit eigener URL).
  const useFallback = FALLBACK_MODELS.has(model.model_id) && !provider.base_url
  const stream = useFallback
    ? client.beta.messages.stream(
        { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as unknown as Parameters<typeof client.beta.messages.stream>[0],
        { signal }
      )
    : client.messages.stream(params, { signal })

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text)
  }
  const final = await stream.finalMessage()
  let notice: string | undefined
  const stop = final.stop_reason as string | null
  if (stop === "refusal") notice = "Das Modell hat diese Anfrage abgelehnt."
  else if (stop === "max_tokens") notice = "Die Antwort wurde wegen der Längenbegrenzung abgeschnitten."
  if (useFallback && final.model && final.model !== model.model_id && stop !== "refusal") {
    notice = `Beantwortet durch Ersatzmodell ${final.model}.`
  }
  const u = final.usage
  return {
    inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    notice,
  }
}

async function streamOpenAI({ provider, model, system, signal, onText }: StreamArgs, msgs: ChatMessage[]) {
  const client = openaiClient(provider, model.model_id)
  const req: Record<string, unknown> = {
    model: model.model_id,
    messages: system ? [{ role: "system", content: system }, ...msgs] : msgs,
    stream: true,
    stream_options: { include_usage: true },
  }
  const official = provider.type === "openai" || provider.type === "azure"
  if (model.max_tokens) req[official ? "max_completion_tokens" : "max_tokens"] = model.max_tokens
  if (model.effort) req.reasoning_effort = model.effort

  const stream = await client.chat.completions.create(
    req as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
    { signal }
  )
  let usage: OpenAI.CompletionUsage | null = null
  let finish: string | null = null
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    if (choice?.delta?.content) onText(choice.delta.content)
    if (choice?.finish_reason) finish = choice.finish_reason
    if (chunk.usage) usage = chunk.usage
  }
  let notice: string | undefined
  if (finish === "length") notice = "Die Antwort wurde wegen der Längenbegrenzung abgeschnitten."
  if (finish === "content_filter") notice = "Die Antwort wurde vom Inhaltsfilter des Anbieters blockiert."
  return { inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0, notice }
}

/** Verfügbare Modelle beim Anbieter abfragen. */
export async function discoverModels(p: ProviderRow) {
  if (p.type === "azure") throw new Error("Azure OpenAI: Bitte die Deployment-Namen manuell als Modell-ID eintragen.")
  const out: { id: string; name: string }[] = []
  if (p.type === "anthropic") {
    for await (const m of anthropicClient(p).models.list()) out.push({ id: m.id, name: m.display_name || m.id })
  } else {
    for await (const m of openaiClient(p).models.list()) out.push({ id: m.id, name: m.id })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

type ErrLike = { name?: string; status?: number; code?: string; message?: string; error?: { message?: string; error?: { message?: string } } }

/** Fehlermeldungen der Anbieter für Benutzer aufbereiten (ohne Schlüssel/Interna). */
export function describeError(e: unknown) {
  const err = e as ErrLike
  if (err?.name === "AbortError") return "Abgebrochen."
  const map: Record<number, string> = {
    400: "Die Anfrage wurde vom Anbieter abgelehnt (ungültige Parameter).",
    401: "Der API-Schlüssel des Anbieters ist ungültig. Bitte Administrator informieren.",
    403: "Kein Zugriff auf dieses Modell beim Anbieter.",
    404: "Das Modell wurde beim Anbieter nicht gefunden.",
    413: "Die Anfrage ist zu groß.",
    429: "Der Anbieter ist ausgelastet oder das Kontingent ist erschöpft. Bitte später erneut versuchen.",
    529: "Der Anbieter ist derzeit überlastet. Bitte später erneut versuchen.",
  }
  if (err?.status && map[err.status]) return map[err.status]
  if (err?.status && err.status >= 500) return "Der Anbieter hat einen Serverfehler gemeldet. Bitte später erneut versuchen."
  if (err?.code === "ECONNREFUSED" || /connect|fetch failed|ENOTFOUND/i.test(String(err?.message)))
    return "Der Anbieter ist nicht erreichbar."
  return "Unerwarteter Fehler beim Anbieter."
}

/** Technische Details für Admin-Oberfläche und Server-Log. */
export function detailError(e: unknown) {
  const err = e as ErrLike
  const msg = err?.error?.error?.message || err?.error?.message || err?.message || String(e)
  return `${err?.status ? `HTTP ${err.status}: ` : ""}${msg}`.slice(0, 500)
}

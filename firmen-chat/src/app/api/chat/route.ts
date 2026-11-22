import crypto from "node:crypto"
import { all, get, run, now, audit, getSetting } from "@/server/db"
import { HttpError, bad, body, route } from "@/server/http"
import { streamChat, describeError, detailError, type ChatMessage, type ProviderRow } from "@/server/providers"
import { dailyLimitFor, modelsForUser, tokensToday } from "@/server/services"
import { findBlockedTerm, redact, splitLines } from "@/server/dlp"

export const maxDuration = 600

const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS) || 200000
const MAX_HISTORY = 60

type Body = { modelId?: number; message?: string; conversationId?: string | null; history?: ChatMessage[] }

export const POST = route({}, async ({ req, user, ip }) => {
  const b = await body<Body>(req)
  const text = String(b.message || "").trim()
  if (!text) throw bad("Leere Nachricht.")
  if (text.length > MAX_MESSAGE_CHARS) throw new HttpError(413, "Die Nachricht ist zu lang.")

  const model = modelsForUser(user).find((m) => m.id === Number(b.modelId))
  if (!model) throw new HttpError(403, "Dieses Modell ist für Sie nicht freigegeben.")
  const provider = get<ProviderRow>("SELECT * FROM providers WHERE id = ?", model.provider_id)!

  const limit = dailyLimitFor(user)
  if (limit > 0 && tokensToday(user.id) >= limit)
    throw new HttpError(429, "Ihr tägliches Kontingent ist aufgebraucht. Es wird um Mitternacht zurückgesetzt.")

  const external = !provider.is_local
  if (external && findBlockedTerm(text, splitLines(getSetting("block_terms")))) {
    audit(user, "chat.blocked", `Modell ${model.model_id}: gesperrter Begriff`, ip)
    throw new HttpError(
      422,
      "Die Nachricht enthält einen Begriff, der nicht an externe Anbieter gesendet werden darf. Bitte ein lokales Modell verwenden."
    )
  }

  // Verlauf: serverseitig gespeichert oder – bei deaktivierter Speicherung – aus dem Browser.
  const storeChats = getSetting("store_chats") === "1"
  let conv: { id: string; title: string } | null = null
  let prior: ChatMessage[] = []
  if (storeChats && b.conversationId) {
    conv = get<{ id: string; title: string }>(
      "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
      String(b.conversationId),
      user.id
    ) ?? null
    if (!conv) throw new HttpError(404, "Unterhaltung nicht gefunden.")
    prior = all<ChatMessage>("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id", conv.id)
  } else if (!storeChats && Array.isArray(b.history)) {
    prior = b.history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
  }
  prior = prior.slice(-MAX_HISTORY)

  if (storeChats) {
    const t = now()
    if (!conv) {
      conv = { id: crypto.randomUUID(), title: text.replace(/\s+/g, " ").slice(0, 60) }
      run(
        "INSERT INTO conversations (id, user_id, title, model_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        conv.id, user.id, conv.title, model.id, t, t
      )
    }
    run("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)", conv.id, text, t)
    run("UPDATE conversations SET updated_at = ?, model_ref = ? WHERE id = ?", t, model.id, conv.id)
  }

  // Datenschutz-Filter für externe Anbieter
  let redactions = 0
  const terms = splitLines(getSetting("redact_terms"))
  const doRedact = external && getSetting("redact_pii") === "1"
  const outgoing = [...prior, { role: "user" as const, content: text }].map((m) => {
    if (!doRedact || m.role !== "user") return m
    const r = redact(m.content, { terms })
    redactions += r.count
    return { role: m.role, content: r.text }
  })

  const system = [
    getSetting("system_prompt"),
    `Heutiges Datum: ${new Date().toLocaleDateString("de-AT", { year: "numeric", month: "long", day: "numeric" })}.`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const abort = new AbortController()
  req.signal.addEventListener("abort", () => abort.abort())
  const enc = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let closed = false
      const send = (o: unknown) => {
        if (closed) return
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`))
        } catch {
          closed = true
        }
      }
      send({ type: "start", conversationId: conv?.id ?? null, title: conv?.title ?? null, redactions })

      const started = now()
      let answer = ""
      let status = "ok"
      let result = { inputTokens: 0, outputTokens: 0 } as Awaited<ReturnType<typeof streamChat>>
      try {
        result = await streamChat({
          provider,
          model,
          system,
          messages: outgoing,
          signal: abort.signal,
          onText: (t) => {
            answer += t
            send({ type: "delta", text: t })
          },
        })
        if (abort.signal.aborted) status = "aborted"
        else if (result.notice) send({ type: "notice", text: result.notice })
      } catch (e) {
        status = abort.signal.aborted ? "aborted" : "error"
        if (status === "error") {
          console.error(`[chat] ${provider.name}/${model.model_id}: ${detailError(e)}`)
          send({ type: "error", error: describeError(e) })
        }
      }

      if (storeChats && conv && answer) {
        const t = now()
        run(
          "INSERT INTO messages (conversation_id, role, content, model_label, created_at) VALUES (?, 'assistant', ?, ?, ?)",
          conv.id, answer, model.display_name, t
        )
        run("UPDATE conversations SET updated_at = ? WHERE id = ?", t, conv.id)
      }
      run(
        `INSERT INTO usage (user_id, username, department, provider_name, model_id, input_tokens, output_tokens, redactions, status, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.id, user.username, user.department, provider.name, model.model_id,
        result.inputTokens || 0, result.outputTokens || 0, redactions, status, now() - started, now()
      )
      send({ type: "done", usage: { input: result.inputTokens, output: result.outputTokens } })
      closed = true
      try {
        ctrl.close()
      } catch {}
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
})

import { get } from "@/server/db"
import { HttpError, bad, body, json, route } from "@/server/http"
import { streamChat, detailError, type ProviderRow } from "@/server/providers"

export const POST = route<{ id: string }>({ admin: true }, async ({ req, params }) => {
  const p = get<ProviderRow>("SELECT * FROM providers WHERE id = ?", Number(params.id))
  if (!p) throw new HttpError(404, "Anbieter nicht gefunden.")
  const modelId = String((await body(req)).modelId || "").trim()
  if (!modelId) throw bad("Modell-ID fehlt.")
  let reply = ""
  const started = Date.now()
  try {
    await streamChat({
      provider: p,
      model: { model_id: modelId, max_tokens: 2000, effort: "" },
      system: "",
      messages: [{ role: "user", content: "Antworte nur mit dem Wort: OK" }],
      signal: AbortSignal.timeout(60000),
      onText: (t) => (reply += t),
    })
  } catch (e) {
    throw new HttpError(502, detailError(e))
  }
  return json({ ok: true, reply: reply.slice(0, 200), ms: Date.now() - started })
})

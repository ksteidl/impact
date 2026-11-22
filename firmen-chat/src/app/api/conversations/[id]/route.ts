import { all, get, run } from "@/server/db"
import { HttpError, bad, body, json, route } from "@/server/http"

type P = { id: string }

export const GET = route<P>({}, ({ user, params }) => {
  const conv = get<{ id: string; title: string; model_ref: number | null }>(
    "SELECT id, title, model_ref FROM conversations WHERE id = ? AND user_id = ?",
    params.id,
    user.id
  )
  if (!conv) throw new HttpError(404, "Unterhaltung nicht gefunden.")
  const messages = all(
    "SELECT role, content, model_label, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
    conv.id
  )
  return json({ ...conv, messages })
})

export const PATCH = route<P>({}, async ({ req, user, params }) => {
  const { title } = await body<{ title?: string }>(req)
  const t = String(title || "").trim().slice(0, 120)
  if (!t) throw bad("Titel fehlt.")
  const r = run("UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?", t, params.id, user.id)
  if (!r.changes) throw new HttpError(404, "Unterhaltung nicht gefunden.")
  return json({ ok: true })
})

export const DELETE = route<P>({}, ({ user, params }) => {
  run("DELETE FROM conversations WHERE id = ? AND user_id = ?", params.id, user.id)
  return json({ ok: true })
})

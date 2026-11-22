import { get, run, audit } from "@/server/db"
import { HttpError, body, json, route } from "@/server/http"
import { validateModel } from "@/server/admin"

type P = { id: string }
type M = { id: number; model_id: string }

export const PUT = route<P>({ admin: true }, async ({ req, user, params, ip }) => {
  const m = get<M>("SELECT id, model_id FROM models WHERE id = ?", Number(params.id))
  if (!m) throw new HttpError(404, "Modell nicht gefunden.")
  const b = await body(req)
  const v = validateModel({ ...b, modelId: b.modelId ?? m.model_id })
  run(
    "UPDATE models SET model_id = ?, display_name = ?, description = ?, enabled = ?, max_tokens = ?, effort = ?, allowed_departments = ?, sort_order = ? WHERE id = ?",
    v.modelId, v.displayName, v.description, v.enabled, v.maxTokens, v.effort, v.allowedDepartments, v.sortOrder, m.id
  )
  audit(user, "model.updated", `${v.modelId}: aktiv=${v.enabled}, Abteilungen=${v.allowedDepartments || "alle"}`, ip)
  return json({ ok: true })
})

export const DELETE = route<P>({ admin: true }, ({ user, params, ip }) => {
  const m = get<M>("SELECT id, model_id FROM models WHERE id = ?", Number(params.id))
  if (!m) throw new HttpError(404, "Modell nicht gefunden.")
  run("DELETE FROM models WHERE id = ?", m.id)
  audit(user, "model.deleted", m.model_id, ip)
  return json({ ok: true })
})

import { all, get } from "@/server/db"
import { HttpError, json, route } from "@/server/http"
import { discoverModels, detailError, type ProviderRow } from "@/server/providers"

export const POST = route<{ id: string }>({ admin: true }, async ({ params }) => {
  const p = get<ProviderRow>("SELECT * FROM providers WHERE id = ?", Number(params.id))
  if (!p) throw new HttpError(404, "Anbieter nicht gefunden.")
  let found: { id: string; name: string }[]
  try {
    found = await discoverModels(p)
  } catch (e) {
    throw new HttpError(502, `Modelle konnten nicht abgerufen werden: ${detailError(e)}`)
  }
  const existing = new Set(all<{ model_id: string }>("SELECT model_id FROM models WHERE provider_id = ?", p.id).map((r) => r.model_id))
  return json(found.map((m) => ({ ...m, added: existing.has(m.id) })))
})

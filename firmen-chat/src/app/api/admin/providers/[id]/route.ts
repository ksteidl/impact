import { get, run, audit } from "@/server/db"
import { encrypt } from "@/server/security"
import { HttpError, body, json, route } from "@/server/http"
import { validateProvider } from "@/server/admin"
import type { ProviderRow } from "@/server/providers"

type P = { id: string }

export const PUT = route<P>({ admin: true }, async ({ req, user, params, ip }) => {
  const p = get<ProviderRow>("SELECT * FROM providers WHERE id = ?", Number(params.id))
  if (!p) throw new HttpError(404, "Anbieter nicht gefunden.")
  const b = await body(req)
  const v = validateProvider(b)
  // Leeres Schlüsselfeld = bisherigen Schlüssel behalten; clearKey = Schlüssel entfernen.
  const keyEnc = b.clearKey ? "" : b.apiKey ? encrypt(String(b.apiKey).trim()) : p.api_key_enc
  run(
    "UPDATE providers SET name = ?, type = ?, base_url = ?, api_key_enc = ?, options_json = ?, is_local = ?, enabled = ? WHERE id = ?",
    v.name, v.type, v.baseUrl, keyEnc, v.options, v.local, v.enabled, p.id
  )
  audit(user, "provider.updated", `${v.name}${b.apiKey ? " (neuer API-Schlüssel)" : ""}`, ip)
  return json({ ok: true })
})

export const DELETE = route<P>({ admin: true }, ({ user, params, ip }) => {
  const p = get<ProviderRow>("SELECT * FROM providers WHERE id = ?", Number(params.id))
  if (!p) throw new HttpError(404, "Anbieter nicht gefunden.")
  run("DELETE FROM providers WHERE id = ?", p.id)
  audit(user, "provider.deleted", p.name, ip)
  return json({ ok: true })
})

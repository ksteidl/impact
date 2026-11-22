import { get, run, audit } from "@/server/db"
import { destroyUserSessions, hashPassword, validatePasswordPolicy, type User } from "@/server/security"
import { HttpError, bad, body, json, route } from "@/server/http"
import { parseLimit } from "@/server/admin"

type P = { id: string }

export const PUT = route<P>({ admin: true }, async ({ req, user, params, ip }) => {
  const u = get<User>("SELECT * FROM users WHERE id = ?", Number(params.id))
  if (!u) throw new HttpError(404, "Benutzer nicht gefunden.")
  const b = await body(req)
  const role = b.role === "admin" ? "admin" : "user"
  const active = b.active === false ? 0 : 1
  if (u.id === user.id && (role !== "admin" || !active))
    throw bad("Sie können sich nicht selbst die Admin-Rechte entziehen oder sich deaktivieren.")
  if (b.password) {
    const policy = validatePasswordPolicy(b.password)
    if (policy) throw bad(policy)
  }
  const department = String(b.department ?? u.department).trim().slice(0, 100)
  run(
    "UPDATE users SET display_name = ?, role = ?, department = ?, daily_token_limit = ?, active = ? WHERE id = ?",
    String(b.displayName || u.display_name).slice(0, 100),
    role,
    department,
    parseLimit(b.dailyTokenLimit),
    active,
    u.id
  )
  if (b.password) {
    run("UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?", hashPassword(String(b.password)), u.id)
    destroyUserSessions(u.id)
    audit(user, "user.password_reset", u.username, ip)
  }
  if (!active) destroyUserSessions(u.id)
  audit(user, "user.updated", `${u.username}: Rolle=${role}, aktiv=${active}, Abteilung=${department || "–"}`, ip)
  return json({ ok: true })
})

export const DELETE = route<P>({ admin: true }, ({ user, params, ip }) => {
  const u = get<User>("SELECT * FROM users WHERE id = ?", Number(params.id))
  if (!u) throw new HttpError(404, "Benutzer nicht gefunden.")
  if (u.id === user.id) throw bad("Sie können sich nicht selbst löschen.")
  run("DELETE FROM users WHERE id = ?", u.id)
  audit(user, "user.deleted", u.username, ip)
  return json({ ok: true })
})

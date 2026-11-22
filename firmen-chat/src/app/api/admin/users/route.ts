import { all, get, run, now, audit } from "@/server/db"
import { hashPassword, validatePasswordPolicy, type User } from "@/server/security"
import { HttpError, bad, body, json, route } from "@/server/http"
import { adminUser, parseLimit } from "@/server/admin"

export const GET = route({ admin: true }, () => json(all<User>("SELECT * FROM users ORDER BY username").map(adminUser)))

export const POST = route({ admin: true }, async ({ req, user, ip }) => {
  const b = await body(req)
  const username = String(b.username || "").trim()
  if (!/^[A-Za-z0-9._@-]{2,64}$/.test(username))
    throw bad("Benutzername: 2–64 Zeichen, nur Buchstaben, Ziffern und . _ @ -")
  const policy = validatePasswordPolicy(b.password)
  if (policy) throw bad(policy)
  if (get("SELECT 1 FROM users WHERE username = ?", username)) throw new HttpError(409, "Benutzername existiert bereits.")
  const role = b.role === "admin" ? "admin" : "user"
  const r = run(
    `INSERT INTO users (username, display_name, password_hash, role, department, daily_token_limit, active, must_change_pw, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    username,
    String(b.displayName || username).slice(0, 100),
    hashPassword(String(b.password)),
    role,
    String(b.department || "").trim().slice(0, 100),
    parseLimit(b.dailyTokenLimit),
    now()
  )
  audit(user, "user.created", `${username} (${role})`, ip)
  return json({ id: Number(r.lastInsertRowid) })
})

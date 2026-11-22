import { cookies } from "next/headers"
import { run, audit } from "@/server/db"
import {
  createSession, destroyUserSessions, hashPassword, validatePasswordPolicy, verifyPassword,
} from "@/server/security"
import { bad, body, json, route, sessionCookie } from "@/server/http"

export const POST = route({ allowPendingPassword: true }, async ({ req, user, ip }) => {
  const { currentPassword, newPassword } = await body<{ currentPassword?: string; newPassword?: string }>(req)
  if (!verifyPassword(String(currentPassword || ""), user.password_hash)) throw bad("Das aktuelle Passwort ist falsch.")
  const policy = validatePasswordPolicy(newPassword)
  if (policy) throw bad(policy)
  if (newPassword === currentPassword) throw bad("Das neue Passwort muss sich unterscheiden.")
  run("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?", hashPassword(newPassword!), user.id)
  // Alle anderen Sitzungen beenden, diese neu ausstellen
  destroyUserSessions(user.id)
  ;(await cookies()).set(sessionCookie(req, createSession(user.id)))
  audit(user, "password.changed", "", ip)
  return json({ ok: true })
})

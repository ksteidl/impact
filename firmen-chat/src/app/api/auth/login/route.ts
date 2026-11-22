import { cookies } from "next/headers"
import { get, run, now, audit } from "@/server/db"
import {
  burnPasswordCheck, createSession, loginBlocked, loginFailed, loginSucceeded, verifyPassword, type User,
} from "@/server/security"
import { HttpError, body, json, route, sessionCookie } from "@/server/http"

export const POST = route({ public: true }, async ({ req, ip }) => {
  const b = await body<{ username?: string; password?: string }>(req)
  const username = String(b.username || "").trim()
  const password = String(b.password || "")
  const key = `${ip}|${username.toLowerCase()}`
  if (loginBlocked(key)) throw new HttpError(429, "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.")

  const user = get<User>("SELECT * FROM users WHERE username = ?", username)
  if (!user) burnPasswordCheck(password)
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    loginFailed(key)
    audit({ username: username.slice(0, 64) || "?" }, "login.failed", "", ip)
    throw new HttpError(401, "Benutzername oder Passwort ist falsch.")
  }
  loginSucceeded(key)
  run("UPDATE users SET last_login = ? WHERE id = ?", now(), user.id)
  audit(user, "login", "", ip)
  ;(await cookies()).set(sessionCookie(req, createSession(user.id)))
  return json({ ok: true, mustChangePassword: !!user.must_change_pw })
})

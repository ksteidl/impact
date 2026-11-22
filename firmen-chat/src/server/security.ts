// Passwort-Hashing, Sitzungen und Verschlüsselung der API-Schlüssel.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { dataDir, get, run, now } from "./db"

// ---------- Schlüssel für die Verschlüsselung der API-Keys ----------
function loadSecret(): string {
  const env = process.env.APP_SECRET
  if (env) {
    if (env.length < 32) throw new Error("APP_SECRET muss mindestens 32 Zeichen lang sein.")
    return env
  }
  const file = path.join(dataDir, "secret.key")
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim()
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const secret = crypto.randomBytes(48).toString("base64url")
  fs.writeFileSync(file, secret, { mode: 0o600 })
  console.warn(
    `[sicherheit] Kein APP_SECRET gesetzt – Schlüssel wurde in ${file} erzeugt. Datei sichern, sonst sind gespeicherte API-Schlüssel verloren.`
  )
  return secret
}

let encKey: Buffer | null = null
function key() {
  if (!encKey) encKey = Buffer.from(crypto.hkdfSync("sha256", loadSecret(), "firmen-chat", "api-key-encryption-v1", 32))
  return encKey
}

export function encrypt(plain: string): string {
  if (!plain) return ""
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".")
}

export function decrypt(token: string): string {
  if (!token) return ""
  const [v, iv, tag, ct] = token.split(".")
  if (v !== "v1") throw new Error("Unbekanntes Schlüsselformat")
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  d.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8")
}

// ---------- Passwörter (scrypt) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT)
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`
}

export function verifyPassword(password: string, stored: string) {
  const [alg, salt, hash] = String(stored).split("$")
  if (alg !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, SCRYPT)
  return crypto.timingSafeEqual(expected, actual)
}

let dummy: string | null = null
/** Gleicher Rechenaufwand bei unbekanntem Benutzer (gegen User-Enumeration). */
export function burnPasswordCheck(password: string) {
  dummy ??= hashPassword(crypto.randomBytes(16).toString("hex"))
  verifyPassword(password, dummy)
}

export function validatePasswordPolicy(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein."
  if (pw.length > 200) return "Das Passwort ist zu lang."
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  if (classes < 3) return "Das Passwort braucht mindestens 3 von: Kleinbuchstaben, Großbuchstaben, Ziffern, Sonderzeichen."
  return null
}

// ---------- Sitzungen ----------
export const SESSION_COOKIE = "fc_sid"
export const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 10
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex")

export type User = {
  id: number
  username: string
  display_name: string
  password_hash: string
  role: "user" | "admin"
  department: string
  daily_token_limit: number | null
  active: number
  must_change_pw: number
  created_at: number
  last_login: number | null
}

export function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url")
  const t = now()
  run(
    "INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    sha256(token),
    userId,
    t,
    t + SESSION_HOURS * 3600000
  )
  return token
}

export function getSessionUser(token: string | undefined): User | null {
  if (!token) return null
  return (
    get<User>(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ? AND s.expires_at > ? AND u.active = 1`,
      sha256(token),
      now()
    ) ?? null
  )
}

export function destroySession(token: string | undefined) {
  if (token) run("DELETE FROM sessions WHERE id_hash = ?", sha256(token))
}

export function destroyUserSessions(userId: number) {
  run("DELETE FROM sessions WHERE user_id = ?", userId)
}

// ---------- Login-Schutz gegen Brute-Force ----------
const g = globalThis as unknown as { __fcAttempts?: Map<string, { count: number; until: number }> }
const attempts = (g.__fcAttempts ??= new Map())
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60000

export function loginBlocked(k: string) {
  const a = attempts.get(k)
  return !!a && a.count >= MAX_ATTEMPTS && a.until > Date.now()
}
export function loginFailed(k: string) {
  const a = attempts.get(k)
  if (!a || a.until < Date.now()) attempts.set(k, { count: 1, until: Date.now() + LOCK_MS })
  else a.count += 1
}
export function loginSucceeded(k: string) {
  attempts.delete(k)
}

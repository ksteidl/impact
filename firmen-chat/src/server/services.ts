import crypto from "node:crypto"
import { all, get, run, now, getSetting, audit } from "./db"
import { hashPassword, validatePasswordPolicy, type User } from "./security"
import type { ProviderType } from "./providers"

export type ModelRow = {
  id: number
  provider_id: number
  model_id: string
  display_name: string
  description: string
  enabled: number
  max_tokens: number | null
  effort: string
  allowed_departments: string
  sort_order: number
  provider_name: string
  provider_type: ProviderType
  is_local: number
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function tokensToday(userId: number) {
  return (
    get<{ t: number }>(
      "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS t FROM usage WHERE user_id = ? AND created_at >= ?",
      userId,
      startOfToday()
    )?.t ?? 0
  )
}

export function dailyLimitFor(user: User) {
  if (user.daily_token_limit !== null && user.daily_token_limit !== undefined) return user.daily_token_limit
  return Number(getSetting("default_daily_tokens")) || 0
}

function departmentAllowed(m: ModelRow, user: User) {
  const allowed = m.allowed_departments
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return allowed.length === 0 || user.role === "admin" || allowed.includes((user.department || "").toLowerCase())
}

export function allModels() {
  return all<ModelRow>(
    `SELECT m.*, p.name AS provider_name, p.type AS provider_type, p.is_local FROM models m
     JOIN providers p ON p.id = m.provider_id ORDER BY m.sort_order, m.display_name`
  )
}

export function modelsForUser(user: User) {
  return all<ModelRow>(
    `SELECT m.*, p.name AS provider_name, p.type AS provider_type, p.is_local FROM models m
     JOIN providers p ON p.id = m.provider_id
     WHERE m.enabled = 1 AND p.enabled = 1 ORDER BY m.sort_order, m.display_name`
  ).filter((m) => departmentAllowed(m, user))
}

export type PublicModel = { id: number; name: string; description: string; provider: string; providerType: ProviderType; local: boolean }
export const publicModel = (m: ModelRow): PublicModel => ({
  id: m.id,
  name: m.display_name,
  description: m.description,
  provider: m.provider_name,
  providerType: m.provider_type,
  local: !!m.is_local,
})

export type ConversationSummary = { id: string; title: string; model_ref: number | null; updated_at: number }
export function conversationsFor(userId: number) {
  return all<ConversationSummary>(
    "SELECT id, title, model_ref, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 300",
    userId
  )
}

export type Me = {
  id: number
  username: string
  displayName: string
  role: "user" | "admin"
  department: string
  storeChats: boolean
  retentionDays: number
  bannerText: string
  usageToday: number
  dailyLimit: number
}
export function meFor(u: User): Me {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    department: u.department,
    storeChats: getSetting("store_chats") === "1",
    retentionDays: Number(getSetting("retention_days")) || 0,
    bannerText: getSetting("banner_text"),
    usageToday: tokensToday(u.id),
    dailyLimit: dailyLimitFor(u),
  }
}

/** Erststart: Administrator anlegen, falls noch keine Benutzer existieren. */
export function bootstrapAdmin() {
  const count = get<{ c: number }>("SELECT COUNT(*) AS c FROM users")?.c ?? 0
  if (count > 0) return
  const username = process.env.ADMIN_USERNAME || "admin"
  let password = process.env.ADMIN_PASSWORD
  if (!password || validatePasswordPolicy(password)) {
    password = crypto.randomBytes(12).toString("base64url") + "a1!A"
    console.log("=".repeat(64))
    console.log(` Erster Administrator angelegt: ${username}`)
    console.log(` Einmal-Passwort: ${password}`)
    console.log(" Das Passwort muss bei der ersten Anmeldung geändert werden.")
    console.log("=".repeat(64))
  }
  run(
    `INSERT INTO users (username, display_name, password_hash, role, department, active, must_change_pw, created_at)
     VALUES (?, 'Administrator', ?, 'admin', 'IT', 1, 1, ?)`,
    username,
    hashPassword(password),
    now()
  )
  audit(null, "bootstrap", `Administrator ${username} angelegt`)
}

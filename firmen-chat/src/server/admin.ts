import "server-only"
import { bad } from "./http"
import type { ProviderType } from "./providers"
import type { ModelRow } from "./services"
import type { User } from "./security"

// ---------- Ausgabeformate für die Verwaltung (ohne Geheimnisse) ----------
export type AdminUser = {
  id: number
  username: string
  displayName: string
  role: "user" | "admin"
  department: string
  dailyTokenLimit: number | null
  active: boolean
  mustChangePassword: boolean
  createdAt: number
  lastLogin: number | null
}
export const adminUser = (u: User): AdminUser => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  department: u.department,
  dailyTokenLimit: u.daily_token_limit,
  active: !!u.active,
  mustChangePassword: !!u.must_change_pw,
  createdAt: u.created_at,
  lastLogin: u.last_login,
})

export type AdminProvider = {
  id: number
  name: string
  type: ProviderType
  baseUrl: string
  hasKey: boolean
  apiVersion: string
  local: boolean
  enabled: boolean
  modelCount: number
}
type ProviderDb = {
  id: number
  name: string
  type: ProviderType
  base_url: string
  api_key_enc: string
  options_json: string
  is_local: number
  enabled: number
  model_count?: number
}
export const adminProvider = (p: ProviderDb): AdminProvider => {
  let apiVersion = ""
  try {
    apiVersion = JSON.parse(p.options_json || "{}").apiVersion || ""
  } catch {}
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.base_url,
    hasKey: !!p.api_key_enc,
    apiVersion,
    local: !!p.is_local,
    enabled: !!p.enabled,
    modelCount: p.model_count ?? 0,
  }
}

export type AdminModel = {
  id: number
  providerId: number
  providerName: string
  providerType: ProviderType
  modelId: string
  displayName: string
  description: string
  enabled: boolean
  maxTokens: number | null
  effort: string
  allowedDepartments: string
  sortOrder: number
  local: boolean
}
export const adminModel = (m: ModelRow): AdminModel => ({
  id: m.id,
  providerId: m.provider_id,
  providerName: m.provider_name,
  providerType: m.provider_type,
  modelId: m.model_id,
  displayName: m.display_name,
  description: m.description,
  enabled: !!m.enabled,
  maxTokens: m.max_tokens,
  effort: m.effort,
  allowedDepartments: m.allowed_departments,
  sortOrder: m.sort_order,
  local: !!m.is_local,
})

// ---------- Validierung ----------
export function parseLimit(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw bad("Ungültiges Token-Limit.")
  return n
}

const PROVIDER_TYPES: ProviderType[] = ["anthropic", "openai", "azure", "openai-compatible"]

export function validateProvider(b: Record<string, unknown>) {
  const name = String(b.name || "").trim().slice(0, 80)
  if (!name) throw bad("Name fehlt.")
  const type = b.type as ProviderType
  if (!PROVIDER_TYPES.includes(type)) throw bad("Ungültiger Anbietertyp.")
  const baseUrl = String(b.baseUrl || "").trim()
  if (baseUrl) {
    let u: URL
    try {
      u = new URL(baseUrl)
    } catch {
      throw bad("Ungültige Basis-URL.")
    }
    if (!["http:", "https:"].includes(u.protocol)) throw bad("Basis-URL muss mit http(s) beginnen.")
  }
  if ((type === "azure" || type === "openai-compatible") && !baseUrl) throw bad("Für diesen Anbietertyp ist eine Basis-URL nötig.")
  const options: Record<string, string> = {}
  if (b.apiVersion) options.apiVersion = String(b.apiVersion).slice(0, 40)
  return {
    name,
    type,
    baseUrl,
    options: JSON.stringify(options),
    local: b.local ? 1 : 0,
    enabled: b.enabled === false ? 0 : 1,
  }
}

const EFFORTS = ["", "minimal", "low", "medium", "high", "xhigh", "max"]

export function validateModel(b: Record<string, unknown>) {
  const modelId = String(b.modelId || "").trim().slice(0, 200)
  if (!modelId) throw bad("Modell-ID fehlt.")
  const maxTokens = b.maxTokens === "" || b.maxTokens == null ? null : Number(b.maxTokens)
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000))
    throw bad("Ungültige maximale Tokenzahl.")
  const effort = String(b.effort || "")
  if (!EFFORTS.includes(effort)) throw bad("Ungültiger Effort-Wert.")
  const sort = Number(b.sortOrder)
  return {
    modelId,
    displayName: String(b.displayName || modelId).trim().slice(0, 100),
    description: String(b.description || "").slice(0, 300),
    enabled: b.enabled === false ? 0 : 1,
    maxTokens,
    effort,
    allowedDepartments: String(b.allowedDepartments || "").slice(0, 500),
    sortOrder: Number.isInteger(sort) && b.sortOrder !== "" && b.sortOrder != null ? sort : 100,
  }
}

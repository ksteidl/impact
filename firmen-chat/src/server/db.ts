// Datenbank: SQLite (in Node.js eingebaut, keine nativen Abhängigkeiten).
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

export const dataDir = process.env.DATA_DIR || path.resolve("data")

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  department TEXT NOT NULL DEFAULT '',
  daily_token_limit INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('anthropic','openai','azure','openai-compatible')),
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL DEFAULT '',
  options_json TEXT NOT NULL DEFAULT '{}',
  is_local INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  max_tokens INTEGER,
  effort TEXT NOT NULL DEFAULT '',
  allowed_departments TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 100,
  UNIQUE (provider_id, model_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model_ref INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  model_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
-- Nutzungsprotokoll: nur Metadaten, keine Chat-Inhalte.
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  provider_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  redactions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_time ON usage(created_at);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit(created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

const g = globalThis as unknown as { __fcDb?: DatabaseSync }

function open() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const d = new DatabaseSync(path.join(dataDir, "firmen-chat.db"))
  d.exec(SCHEMA)
  return d
}

// Eine Verbindung pro Prozess, erst beim ersten Zugriff geöffnet (nicht schon beim
// Build) – überlebt auch Hot-Reload im Entwicklungsmodus.
export function getDb(): DatabaseSync {
  return (g.__fcDb ??= open())
}

export type Row = Record<string, unknown>
// node:sqlite liefert Objekte ohne Prototyp – in normale Objekte umwandeln,
// damit sie an Client-Komponenten übergeben werden können.
export const get = <T = Row>(sql: string, ...p: (string | number | null)[]) => {
  const row = getDb().prepare(sql).get(...p)
  return (row ? { ...row } : undefined) as T | undefined
}
export const all = <T = Row>(sql: string, ...p: (string | number | null)[]) =>
  getDb().prepare(sql).all(...p).map((r) => ({ ...r })) as T[]
export const run = (sql: string, ...p: (string | number | null)[]) => getDb().prepare(sql).run(...p)

export const now = () => Date.now()

export function transaction<T>(fn: () => T): T {
  getDb().exec("BEGIN")
  try {
    const r = fn()
    getDb().exec("COMMIT")
    return r
  } catch (e) {
    getDb().exec("ROLLBACK")
    throw e
  }
}

// ---------- Einstellungen ----------
export const DEFAULT_SETTINGS = {
  system_prompt:
    "Du bist der interne KI-Assistent des Unternehmens. Antworte hilfreich, sachlich und auf Deutsch, sofern nicht anders gewünscht.",
  store_chats: "1",
  retention_days: "90",
  usage_retention_days: "365",
  redact_pii: "1",
  redact_terms: "",
  block_terms: "",
  default_daily_tokens: "200000",
  banner_text: "Bitte keine vertraulichen Kundendaten an externe Modelle senden. Modelle mit Schloss-Symbol laufen im Firmennetz.",
}
export type SettingKey = keyof typeof DEFAULT_SETTINGS

export function getSetting(key: SettingKey): string {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)
  return row ? row.value : DEFAULT_SETTINGS[key]
}

export function getAllSettings() {
  const out = {} as Record<SettingKey, string>
  for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) out[k] = getSetting(k)
  return out
}

export function setSetting(key: SettingKey, value: string) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  )
}

export function audit(
  actor: { id?: number; username: string } | null,
  action: string,
  details = "",
  ip = ""
) {
  run(
    "INSERT INTO audit (actor_id, actor_name, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    actor?.id ?? null,
    actor?.username ?? "system",
    action,
    String(details).slice(0, 2000),
    ip,
    now()
  )
}

// Aufbewahrungsfristen durchsetzen (läuft stündlich, siehe instrumentation.ts).
export function enforceRetention() {
  const t = now()
  run("DELETE FROM sessions WHERE expires_at < ?", t)
  const chatDays = Number(getSetting("retention_days")) || 0
  if (chatDays > 0) run("DELETE FROM conversations WHERE updated_at < ?", t - chatDays * 86400000)
  if (getSetting("store_chats") !== "1") getDb().exec("DELETE FROM conversations")
  const logDays = Number(getSetting("usage_retention_days")) || 0
  if (logDays > 0) {
    const cutoff = t - logDays * 86400000
    run("DELETE FROM usage WHERE created_at < ?", cutoff)
    run("DELETE FROM audit WHERE created_at < ?", cutoff)
  }
}

// Datenbank: SQLite (in Node.js eingebaut, keine nativen Abhängigkeiten).
// Alle Daten bleiben in einer einzigen Datei im Datenverzeichnis.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

export const dataDir = DATA_DIR;
export const db = new DatabaseSync(path.join(DATA_DIR, 'firmen-chat.db'));

db.exec(`
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
  daily_token_limit INTEGER,            -- NULL = Standard aus den Richtlinien
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
  is_local INTEGER NOT NULL DEFAULT 0,  -- 1 = Daten verlassen das Firmennetz nicht
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
  allowed_departments TEXT NOT NULL DEFAULT '',  -- kommagetrennt, leer = alle
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const DEFAULT_SETTINGS = {
  system_prompt:
    'Du bist der interne KI-Assistent des Unternehmens. Antworte hilfreich, sachlich und auf Deutsch, sofern nicht anders gewünscht.',
  store_chats: '1', // Chatverläufe serverseitig speichern
  retention_days: '90', // Chats nach X Tagen Inaktivität löschen (0 = nie)
  usage_retention_days: '365', // Nutzungs- und Audit-Protokoll aufbewahren
  redact_pii: '1', // personenbezogene Daten vor externen Anbietern schwärzen
  redact_terms: '', // zusätzliche zu schwärzende Begriffe (eine Zeile je Begriff)
  block_terms: '', // Begriffe, die das Senden an externe Anbieter blockieren
  default_daily_tokens: '200000', // 0 = unbegrenzt
  banner_text:
    'Bitte keine vertraulichen Kundendaten an externe Modelle senden. Modelle mit 🔒 laufen im Firmennetz.',
};

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSetting(key) {
  const row = getStmt.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key] ?? '';
}

export function getAllSettings() {
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = getSetting(key);
  return out;
}

export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unbekannte Einstellung: ${key}`);
  setStmt.run(key, String(value));
}

export function now() {
  return Date.now();
}

export function audit(actor, action, details = '', ip = '') {
  db.prepare(
    'INSERT INTO audit (actor_id, actor_name, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(actor?.id ?? null, actor?.username ?? 'system', action, String(details).slice(0, 2000), ip, now());
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Aufbewahrungsfristen durchsetzen (läuft stündlich).
export function enforceRetention() {
  const t = now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
  const chatDays = Number(getSetting('retention_days')) || 0;
  if (chatDays > 0) {
    db.prepare('DELETE FROM conversations WHERE updated_at < ?').run(t - chatDays * 86400000);
  }
  if (getSetting('store_chats') !== '1') {
    db.exec('DELETE FROM conversations');
  }
  const logDays = Number(getSetting('usage_retention_days')) || 0;
  if (logDays > 0) {
    const cutoff = t - logDays * 86400000;
    db.prepare('DELETE FROM usage WHERE created_at < ?').run(cutoff);
    db.prepare('DELETE FROM audit WHERE created_at < ?').run(cutoff);
  }
}

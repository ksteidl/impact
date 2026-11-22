// Passwort-Hashing, Sitzungen und Verschlüsselung der API-Schlüssel.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, dataDir, now } from './db.js';

// ---------- Geheimer Schlüssel für die Verschlüsselung der API-Keys ----------
function loadSecret() {
  if (process.env.APP_SECRET) {
    if (process.env.APP_SECRET.length < 32) {
      throw new Error('APP_SECRET muss mindestens 32 Zeichen lang sein.');
    }
    return process.env.APP_SECRET;
  }
  const file = path.join(dataDir, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.warn(
    `[sicherheit] Kein APP_SECRET gesetzt – zufälliger Schlüssel wurde in ${file} erzeugt. ` +
      'Diese Datei sichern! Ohne sie sind gespeicherte API-Schlüssel nicht mehr lesbar.'
  );
  return secret;
}

const ENC_KEY = Buffer.from(
  crypto.hkdfSync('sha256', loadSecret(), 'firmen-chat', 'api-key-encryption-v1', 32)
);

export function encrypt(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(token) {
  if (!token) return '';
  const [v, iv, tag, ct] = token.split('.');
  if (v !== 'v1') throw new Error('Unbekanntes Schlüsselformat');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

// ---------- Passwörter (scrypt) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

// Gleicher Rechenaufwand auch bei unbekanntem Benutzernamen (gegen User-Enumeration).
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));
export function burnPasswordCheck(password) {
  verifyPassword(password, DUMMY_HASH);
}

export function validatePasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Das Passwort muss mindestens 10 Zeichen lang sein.';
  if (pw.length > 200) return 'Das Passwort ist zu lang.';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'Das Passwort braucht mindestens 3 von: Kleinbuchstaben, Großbuchstaben, Ziffern, Sonderzeichen.';
  return null;
}

// ---------- Sitzungen ----------
export const SESSION_COOKIE = 'fc_sid';
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 10;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    t,
    t + SESSION_HOURS * 3600000
  );
  return { token, maxAge: SESSION_HOURS * 3600000 };
}

export function getSessionUser(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ? AND s.expires_at > ? AND u.active = 1`
    )
    .get(sha256(token), now());
  return row || null;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(token));
}

export function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- Login-Schutz gegen Brute-Force ----------
const attempts = new Map(); // key -> { count, until }
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60000;

export function loginBlocked(key) {
  const a = attempts.get(key);
  return a && a.count >= MAX_ATTEMPTS && a.until > Date.now();
}
export function loginFailed(key) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + LOCK_MS });
  else a.count += 1;
}
export function loginSucceeded(key) {
  attempts.delete(key);
}

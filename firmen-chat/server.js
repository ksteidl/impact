// Firmen-Chat – selbst gehostetes KI-Chat-Portal für Mitarbeiter.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, now, audit, getSetting, getAllSettings, setSetting, DEFAULT_SETTINGS, enforceRetention, transaction } from './src/db.js';
import {
  SESSION_COOKIE, parseCookies, createSession, getSessionUser, destroySession, destroyUserSessions,
  hashPassword, verifyPassword, burnPasswordCheck, validatePasswordPolicy, encrypt,
  loginBlocked, loginFailed, loginSucceeded,
} from './src/security.js';
import { streamChat, discoverModels, describeError, detailError } from './src/providers.js';
import { redact, findBlockedTerm, splitLines } from './src/dlp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS) || 200000;
const MAX_HISTORY_MESSAGES = 60;

const app = express();
app.disable('x-powered-by');
// Hinter einem Reverse-Proxy (TLS): TRUST_PROXY=1 setzen, damit IP und https erkannt werden.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false);

// ---------- Sicherheits-Header ----------
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
      "font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '2mb' }));

// ---------- CSRF-Schutz: zustandsändernde Anfragen nur als JSON von der eigenen Origin ----------
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.is('application/json') && req.method !== 'DELETE') {
    return res.status(415).json({ error: 'Nur JSON-Anfragen erlaubt.' });
  }
  const origin = req.get('origin');
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = '';
    }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Ungültige Herkunft der Anfrage.' });
  }
  if (req.get('x-requested-with') !== 'firmen-chat') {
    return res.status(403).json({ error: 'Fehlender Anfrage-Header.' });
  }
  next();
});

// ---------- Authentifizierung ----------
function currentUser(req) {
  return getSessionUser(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  req.user = user;
  // Bei erzwungener Passwortänderung nur die dafür nötigen Endpunkte erlauben.
  if (user.must_change_pw && !['/api/me', '/api/me/password', '/api/logout'].includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ error: 'Bitte zuerst das Passwort ändern.', mustChangePassword: true });
  }
  next();
}

function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur für Administratoren.' });
    next();
  });
}

function cookieOptions(req, maxAge) {
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/', maxAge };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (loginBlocked(key)) {
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) burnPasswordCheck(password);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    loginFailed(key);
    audit({ username: username.slice(0, 64) || '?' }, 'login.failed', '', req.ip);
    return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
  }
  loginSucceeded(key);
  const { token, maxAge } = createSession(user.id);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), user.id);
  audit(user, 'login', '', req.ip);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, maxAge));
  res.json({ ok: true, mustChangePassword: !!user.must_change_pw });
});

app.post('/api/logout', (req, res) => {
  destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    department: u.department,
    mustChangePassword: !!u.must_change_pw,
    storeChats: getSetting('store_chats') === '1',
    retentionDays: Number(getSetting('retention_days')) || 0,
    bannerText: getSetting('banner_text'),
    usageToday: tokensToday(u.id),
    dailyLimit: dailyLimitFor(u),
  });
});

app.post('/api/me/password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(String(currentPassword || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
  }
  const policy = validatePasswordPolicy(newPassword);
  if (policy) return res.status(400).json({ error: policy });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Das neue Passwort muss sich unterscheiden.' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  destroyUserSessions(req.user.id);
  const { token, maxAge } = createSession(req.user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, maxAge));
  audit(req.user, 'password.changed', '', req.ip);
  res.json({ ok: true });
});

// ---------- Modelle & Kontingente ----------
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function tokensToday(userId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS t FROM usage WHERE user_id = ? AND created_at >= ?')
    .get(userId, startOfToday());
  return row.t;
}

function dailyLimitFor(user) {
  if (user.daily_token_limit !== null && user.daily_token_limit !== undefined) return user.daily_token_limit;
  return Number(getSetting('default_daily_tokens')) || 0;
}

function departmentAllowed(model, user) {
  const allowed = model.allowed_departments
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || user.role === 'admin' || allowed.includes((user.department || '').toLowerCase());
}

function modelsForUser(user) {
  const rows = db
    .prepare(
      `SELECT m.*, p.name AS provider_name, p.is_local FROM models m
       JOIN providers p ON p.id = m.provider_id
       WHERE m.enabled = 1 AND p.enabled = 1
       ORDER BY m.sort_order, m.display_name`
    )
    .all();
  return rows.filter((m) => departmentAllowed(m, user));
}

app.get('/api/models', requireUser, (req, res) => {
  res.json(
    modelsForUser(req.user).map((m) => ({
      id: m.id,
      name: m.display_name,
      description: m.description,
      provider: m.provider_name,
      local: !!m.is_local,
    }))
  );
});

// ---------- Unterhaltungen ----------
app.get('/api/conversations', requireUser, (req, res) => {
  res.json(
    db
      .prepare('SELECT id, title, model_ref, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200')
      .all(req.user.id)
  );
});

app.get('/api/conversations/:id', requireUser, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Unterhaltung nicht gefunden.' });
  const messages = db
    .prepare('SELECT role, content, model_label, created_at FROM messages WHERE conversation_id = ? ORDER BY id')
    .all(conv.id);
  res.json({ ...conv, messages });
});

app.patch('/api/conversations/:id', requireUser, (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  if (!title) return res.status(400).json({ error: 'Titel fehlt.' });
  const r = db.prepare('UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?').run(title, req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Unterhaltung nicht gefunden.' });
  res.json({ ok: true });
});

app.delete('/api/conversations/:id', requireUser, (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/conversations', requireUser, (req, res) => {
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- Chat (Streaming via Server-Sent Events) ----------
app.post(
  '/api/chat',
  requireUser,
  wrap(async (req, res) => {
    const user = req.user;
    const { modelId, message, conversationId, history } = req.body || {};
    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ error: 'Leere Nachricht.' });
    if (text.length > MAX_MESSAGE_CHARS) return res.status(413).json({ error: 'Die Nachricht ist zu lang.' });

    const model = modelsForUser(user).find((m) => m.id === Number(modelId));
    if (!model) return res.status(403).json({ error: 'Dieses Modell ist für Sie nicht freigegeben.' });
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(model.provider_id);

    const limit = dailyLimitFor(user);
    if (limit > 0 && tokensToday(user.id) >= limit) {
      return res.status(429).json({ error: 'Ihr tägliches Kontingent ist aufgebraucht. Es wird um Mitternacht zurückgesetzt.' });
    }

    const external = !provider.is_local;
    if (external) {
      const blocked = findBlockedTerm(text, splitLines(getSetting('block_terms')));
      if (blocked) {
        audit(user, 'chat.blocked', `Modell ${model.model_id}: gesperrter Begriff`, req.ip);
        return res.status(422).json({
          error: 'Die Nachricht enthält einen Begriff, der nicht an externe Anbieter gesendet werden darf. Bitte ein lokales Modell (🔒) verwenden.',
        });
      }
    }

    // Verlauf laden: serverseitig gespeichert oder (bei deaktivierter Speicherung) vom Browser.
    const storeChats = getSetting('store_chats') === '1';
    let conv = null;
    let prior = [];
    if (storeChats) {
      if (conversationId) {
        conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(String(conversationId), user.id);
        if (!conv) return res.status(404).json({ error: 'Unterhaltung nicht gefunden.' });
        prior = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id').all(conv.id);
      }
    } else if (Array.isArray(history)) {
      prior = history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
    }
    prior = prior.slice(-MAX_HISTORY_MESSAGES);

    if (storeChats) {
      const t = now();
      if (!conv) {
        conv = { id: crypto.randomUUID(), title: text.replace(/\s+/g, ' ').slice(0, 60) };
        db.prepare('INSERT INTO conversations (id, user_id, title, model_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          conv.id, user.id, conv.title, model.id, t, t
        );
      }
      db.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(conv.id, 'user', text, t);
      db.prepare('UPDATE conversations SET updated_at = ?, model_ref = ? WHERE id = ?').run(t, model.id, conv.id);
    }

    // Datenschutz-Filter für externe Anbieter
    let redactions = 0;
    const redactTerms = splitLines(getSetting('redact_terms'));
    const doRedact = external && getSetting('redact_pii') === '1';
    const outgoing = [...prior, { role: 'user', content: text }].map((m) => {
      if (!doRedact || m.role !== 'user') return m;
      const r = redact(m.content, { terms: redactTerms });
      redactions += r.count;
      return { role: m.role, content: r.text };
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'start', conversationId: conv?.id || null, title: conv?.title || null, redactions });

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const system = [
      getSetting('system_prompt'),
      `Heutiges Datum: ${new Date().toLocaleDateString('de-AT', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const started = now();
    let answer = '';
    let status = 'ok';
    let result = { inputTokens: 0, outputTokens: 0 };
    try {
      result = await streamChat({
        provider,
        model,
        system,
        messages: outgoing,
        signal: controller.signal,
        onText: (t) => {
          answer += t;
          send({ type: 'delta', text: t });
        },
      });
      if (controller.signal.aborted) status = 'aborted';
      else if (result.notice) send({ type: 'notice', text: result.notice });
    } catch (err) {
      status = controller.signal.aborted ? 'aborted' : 'error';
      if (status === 'error') {
        console.error(`[chat] ${provider.name}/${model.model_id}: ${detailError(err)}`);
        send({ type: 'error', error: describeError(err) });
      }
    }

    if (storeChats && conv && answer) {
      const t = now();
      db.prepare('INSERT INTO messages (conversation_id, role, content, model_label, created_at) VALUES (?, ?, ?, ?, ?)').run(
        conv.id, 'assistant', answer, model.display_name, t
      );
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(t, conv.id);
    }
    db.prepare(
      `INSERT INTO usage (user_id, username, department, provider_name, model_id, input_tokens, output_tokens, redactions, status, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id, user.username, user.department, provider.name, model.model_id,
      result.inputTokens || 0, result.outputTokens || 0, redactions, status, now() - started, now()
    );

    if (!res.writableEnded && !controller.signal.aborted) {
      send({ type: 'done', usage: { input: result.inputTokens, output: result.outputTokens } });
      res.end();
    }
  })
);

// =====================================================================
//                              ADMIN
// =====================================================================
const admin = express.Router();
admin.use(requireAdmin);

// ---------- Benutzer ----------
const userPublic = (u) => ({
  id: u.id, username: u.username, displayName: u.display_name, role: u.role, department: u.department,
  dailyTokenLimit: u.daily_token_limit, active: !!u.active, mustChangePassword: !!u.must_change_pw,
  createdAt: u.created_at, lastLogin: u.last_login,
});

admin.get('/users', (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY username').all().map(userPublic));
});

function parseLimit(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error('Ungültiges Token-Limit.'), { status: 400 });
  return n;
}

admin.post('/users', (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim();
  if (!/^[A-Za-z0-9._@-]{2,64}$/.test(username)) {
    return res.status(400).json({ error: 'Benutzername: 2–64 Zeichen, nur Buchstaben, Ziffern und . _ @ -' });
  }
  const policy = validatePasswordPolicy(b.password);
  if (policy) return res.status(400).json({ error: policy });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Benutzername existiert bereits.' });
  }
  const r = db
    .prepare(
      `INSERT INTO users (username, display_name, password_hash, role, department, daily_token_limit, active, must_change_pw, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`
    )
    .run(
      username, String(b.displayName || username).slice(0, 100), hashPassword(b.password),
      b.role === 'admin' ? 'admin' : 'user', String(b.department || '').trim().slice(0, 100), parseLimit(b.dailyTokenLimit), now()
    );
  audit(req.user, 'user.created', `${username} (${b.role === 'admin' ? 'admin' : 'user'})`, req.ip);
  res.json({ id: Number(r.lastInsertRowid) });
});

admin.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const b = req.body || {};
  const role = b.role === 'admin' ? 'admin' : 'user';
  const active = b.active === false ? 0 : 1;
  if (u.id === req.user.id && (role !== 'admin' || !active)) {
    return res.status(400).json({ error: 'Sie können sich nicht selbst die Admin-Rechte entziehen oder sich deaktivieren.' });
  }
  db.prepare('UPDATE users SET display_name = ?, role = ?, department = ?, daily_token_limit = ?, active = ? WHERE id = ?').run(
    String(b.displayName || u.display_name).slice(0, 100), role, String(b.department ?? u.department).trim().slice(0, 100),
    parseLimit(b.dailyTokenLimit), active, u.id
  );
  if (b.password) {
    const policy = validatePasswordPolicy(b.password);
    if (policy) return res.status(400).json({ error: policy });
    db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?').run(hashPassword(b.password), u.id);
    destroyUserSessions(u.id);
    audit(req.user, 'user.password_reset', u.username, req.ip);
  }
  if (!active) destroyUserSessions(u.id);
  audit(req.user, 'user.updated', `${u.username}: Rolle=${role}, aktiv=${active}, Abteilung=${b.department ?? u.department}`, req.ip);
  res.json({ ok: true });
});

admin.delete('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Sie können sich nicht selbst löschen.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  audit(req.user, 'user.deleted', u.username, req.ip);
  res.json({ ok: true });
});

// ---------- Anbieter ----------
const PROVIDER_TYPES = ['anthropic', 'openai', 'azure', 'openai-compatible'];
const providerPublic = (p) => ({
  id: p.id, name: p.name, type: p.type, baseUrl: p.base_url, hasKey: !!p.api_key_enc,
  options: JSON.parse(p.options_json || '{}'), local: !!p.is_local, enabled: !!p.enabled,
});

function validateProvider(b) {
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) throw Object.assign(new Error('Name fehlt.'), { status: 400 });
  if (!PROVIDER_TYPES.includes(b.type)) throw Object.assign(new Error('Ungültiger Anbietertyp.'), { status: 400 });
  const baseUrl = String(b.baseUrl || '').trim();
  if (baseUrl) {
    let u;
    try {
      u = new URL(baseUrl);
    } catch {
      throw Object.assign(new Error('Ungültige Basis-URL.'), { status: 400 });
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Basis-URL muss http(s) sein.'), { status: 400 });
  }
  if ((b.type === 'azure' || b.type === 'openai-compatible') && !baseUrl) {
    throw Object.assign(new Error('Für diesen Anbietertyp ist eine Basis-URL nötig.'), { status: 400 });
  }
  const options = {};
  if (b.options?.apiVersion) options.apiVersion = String(b.options.apiVersion).slice(0, 40);
  return { name, type: b.type, baseUrl, options: JSON.stringify(options), local: b.local ? 1 : 0, enabled: b.enabled === false ? 0 : 1 };
}

admin.get('/providers', (req, res) => {
  res.json(db.prepare('SELECT * FROM providers ORDER BY name').all().map(providerPublic));
});

admin.post('/providers', (req, res) => {
  const v = validateProvider(req.body || {});
  const r = db
    .prepare('INSERT INTO providers (name, type, base_url, api_key_enc, options_json, is_local, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(v.name, v.type, v.baseUrl, encrypt(String(req.body.apiKey || '').trim()), v.options, v.local, v.enabled, now());
  audit(req.user, 'provider.created', `${v.name} (${v.type}${v.local ? ', lokal' : ''})`, req.ip);
  res.json({ id: Number(r.lastInsertRowid) });
});

admin.put('/providers/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Anbieter nicht gefunden.' });
  const v = validateProvider(req.body || {});
  // Leeres Schlüsselfeld = bisherigen Schlüssel behalten; clearKey = Schlüssel entfernen.
  const keyEnc = req.body.clearKey ? '' : req.body.apiKey ? encrypt(String(req.body.apiKey).trim()) : p.api_key_enc;
  db.prepare('UPDATE providers SET name = ?, type = ?, base_url = ?, api_key_enc = ?, options_json = ?, is_local = ?, enabled = ? WHERE id = ?').run(
    v.name, v.type, v.baseUrl, keyEnc, v.options, v.local, v.enabled, p.id
  );
  audit(req.user, 'provider.updated', `${v.name}${req.body.apiKey ? ' (neuer API-Schlüssel)' : ''}`, req.ip);
  res.json({ ok: true });
});

admin.delete('/providers/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Anbieter nicht gefunden.' });
  db.prepare('DELETE FROM providers WHERE id = ?').run(p.id);
  audit(req.user, 'provider.deleted', p.name, req.ip);
  res.json({ ok: true });
});

admin.post(
  '/providers/:id/discover',
  wrap(async (req, res) => {
    const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Anbieter nicht gefunden.' });
    try {
      const found = await discoverModels(p);
      const existing = new Set(db.prepare('SELECT model_id FROM models WHERE provider_id = ?').all(p.id).map((r) => r.model_id));
      res.json(found.map((m) => ({ ...m, added: existing.has(m.id) })));
    } catch (err) {
      res.status(502).json({ error: `Modelle konnten nicht abgerufen werden: ${detailError(err)}` });
    }
  })
);

admin.post(
  '/providers/:id/test',
  wrap(async (req, res) => {
    const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Anbieter nicht gefunden.' });
    const modelId = String(req.body?.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'Modell-ID fehlt.' });
    let text = '';
    try {
      await streamChat({
        provider: p,
        model: { model_id: modelId, max_tokens: 2000, effort: '' },
        system: '',
        messages: [{ role: 'user', content: 'Antworte nur mit dem Wort: OK' }],
        signal: AbortSignal.timeout(60000),
        onText: (t) => (text += t),
      });
      res.json({ ok: true, reply: text.slice(0, 200) });
    } catch (err) {
      res.status(502).json({ error: detailError(err) });
    }
  })
);

// ---------- Modelle ----------
const modelPublic = (m) => ({
  id: m.id, providerId: m.provider_id, providerName: m.provider_name, modelId: m.model_id, displayName: m.display_name,
  description: m.description, enabled: !!m.enabled, maxTokens: m.max_tokens, effort: m.effort,
  allowedDepartments: m.allowed_departments, sortOrder: m.sort_order, local: !!m.is_local,
});

admin.get('/models', (req, res) => {
  res.json(
    db
      .prepare('SELECT m.*, p.name AS provider_name, p.is_local FROM models m JOIN providers p ON p.id = m.provider_id ORDER BY m.sort_order, m.display_name')
      .all()
      .map(modelPublic)
  );
});

const EFFORTS = ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
function validateModel(b) {
  const modelId = String(b.modelId || '').trim().slice(0, 200);
  if (!modelId) throw Object.assign(new Error('Modell-ID fehlt.'), { status: 400 });
  const maxTokens = b.maxTokens === '' || b.maxTokens == null ? null : Number(b.maxTokens);
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1000000)) {
    throw Object.assign(new Error('Ungültige maximale Tokenzahl.'), { status: 400 });
  }
  const effort = String(b.effort || '');
  if (!EFFORTS.includes(effort)) throw Object.assign(new Error('Ungültiger Effort-Wert.'), { status: 400 });
  return {
    modelId,
    displayName: String(b.displayName || modelId).trim().slice(0, 100),
    description: String(b.description || '').slice(0, 300),
    enabled: b.enabled === false ? 0 : 1,
    maxTokens,
    effort,
    allowedDepartments: String(b.allowedDepartments || '').slice(0, 500),
    sortOrder: Number.isInteger(Number(b.sortOrder)) ? Number(b.sortOrder) : 100,
  };
}

admin.post('/models', (req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(Number(b.providerId));
  if (!p) return res.status(400).json({ error: 'Anbieter nicht gefunden.' });
  const list = Array.isArray(b.models) ? b.models : [b];
  const ids = transaction(() =>
    list.map((item) => {
      const v = validateModel(item);
      const r = db
        .prepare(
          `INSERT INTO models (provider_id, model_id, display_name, description, enabled, max_tokens, effort, allowed_departments, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider_id, model_id) DO NOTHING`
        )
        .run(p.id, v.modelId, v.displayName, v.description, v.enabled, v.maxTokens, v.effort, v.allowedDepartments, v.sortOrder);
      return Number(r.lastInsertRowid);
    })
  );
  audit(req.user, 'model.created', `${p.name}: ${list.map((m) => m.modelId).join(', ')}`.slice(0, 2000), req.ip);
  res.json({ ids });
});

admin.put('/models/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM models WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Modell nicht gefunden.' });
  const v = validateModel({ ...req.body, modelId: req.body?.modelId ?? m.model_id });
  db.prepare(
    'UPDATE models SET model_id = ?, display_name = ?, description = ?, enabled = ?, max_tokens = ?, effort = ?, allowed_departments = ?, sort_order = ? WHERE id = ?'
  ).run(v.modelId, v.displayName, v.description, v.enabled, v.maxTokens, v.effort, v.allowedDepartments, v.sortOrder, m.id);
  audit(req.user, 'model.updated', `${v.modelId}: aktiv=${v.enabled}, Abteilungen=${v.allowedDepartments || 'alle'}`, req.ip);
  res.json({ ok: true });
});

admin.delete('/models/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM models WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Modell nicht gefunden.' });
  db.prepare('DELETE FROM models WHERE id = ?').run(m.id);
  audit(req.user, 'model.deleted', m.model_id, req.ip);
  res.json({ ok: true });
});

// ---------- Richtlinien ----------
admin.get('/settings', (req, res) => res.json(getAllSettings()));

admin.put('/settings', (req, res) => {
  const b = req.body || {};
  const changed = [];
  transaction(() => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in b)) continue;
      let value = String(b[key]);
      if (['retention_days', 'usage_retention_days', 'default_daily_tokens'].includes(key)) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error(`Ungültiger Wert für ${key}.`), { status: 400 });
        value = String(n);
      }
      if (['store_chats', 'redact_pii'].includes(key)) value = value === '1' || value === 'true' ? '1' : '0';
      if (value !== getSetting(key)) {
        setSetting(key, value.slice(0, 20000));
        changed.push(key);
      }
    }
  });
  if (changed.length) {
    audit(req.user, 'settings.updated', changed.join(', '), req.ip);
    enforceRetention();
  }
  res.json({ ok: true, changed });
});

// ---------- Auswertung ----------
admin.get('/usage', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 3650);
  const since = now() - days * 86400000;
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output,
              COALESCE(SUM(redactions),0) AS redactions, COUNT(DISTINCT user_id) AS users,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
       FROM usage WHERE created_at >= ?`
    )
    .get(since);
  const byModel = db
    .prepare(
      `SELECT provider_name, model_id, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output
       FROM usage WHERE created_at >= ? GROUP BY provider_name, model_id ORDER BY requests DESC`
    )
    .all(since);
  const byUser = db
    .prepare(
      `SELECT username, department, COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(redactions) AS redactions
       FROM usage WHERE created_at >= ? GROUP BY username, department ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC LIMIT 200`
    )
    .all(since);
  const byDay = db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS requests, SUM(input_tokens + output_tokens) AS tokens
       FROM usage WHERE created_at >= ? GROUP BY day ORDER BY day`
    )
    .all(since);
  res.json({ days, totals, byModel, byUser, byDay });
});

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // Schutz gegen Formel-Injection in Excel
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

admin.get('/usage.csv', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 3650);
  const rows = db.prepare('SELECT * FROM usage WHERE created_at >= ? ORDER BY created_at').all(now() - days * 86400000);
  const header = ['Zeitpunkt', 'Benutzer', 'Abteilung', 'Anbieter', 'Modell', 'Input-Tokens', 'Output-Tokens', 'Schwärzungen', 'Status', 'Dauer (ms)'];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [new Date(r.created_at).toISOString(), r.username, r.department, r.provider_name, r.model_id, r.input_tokens, r.output_tokens, r.redactions, r.status, r.duration_ms]
        .map(csvCell)
        .join(';')
    );
  }
  audit(req.user, 'usage.exported', `${days} Tage`, req.ip);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nutzung-${days}-tage.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

admin.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 300, 2000);
  res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit));
});

app.use('/api/admin', admin);

// ---------- Statische Dateien ----------
const pub = path.join(__dirname, 'public');
app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(pub, 'login.html')));
app.use(express.static(pub, { index: 'index.html', maxAge: '1h' }));
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// ---------- Fehlerbehandlung ----------
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'Interner Serverfehler.' : err.message });
});

// ---------- Erststart: Administrator anlegen ----------
function bootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  if (!password || validatePasswordPolicy(password)) {
    password = crypto.randomBytes(12).toString('base64url') + 'a1!A';
    console.log('='.repeat(64));
    console.log(` Erster Administrator angelegt: ${username}`);
    console.log(` Einmal-Passwort: ${password}`);
    console.log(' Das Passwort muss bei der ersten Anmeldung geändert werden.');
    console.log('='.repeat(64));
  }
  db.prepare(
    `INSERT INTO users (username, display_name, password_hash, role, department, active, must_change_pw, created_at)
     VALUES (?, 'Administrator', ?, 'admin', 'IT', 1, 1, ?)`
  ).run(username, hashPassword(password), now());
  audit(null, 'bootstrap', `Administrator ${username} angelegt`);
}

bootstrapAdmin();
enforceRetention();
setInterval(enforceRetention, 3600000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Firmen-Chat läuft auf http://${HOST}:${PORT}`);
});

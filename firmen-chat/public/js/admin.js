import { api, el, toast, fmtNumber, fmtDate, logout, formDialog, confirmDialog } from './common.js';

const view = document.getElementById('view');

// Vorlagen für gängige Anbieter. Alle außer Anthropic und Azure sprechen das
// OpenAI-kompatible Protokoll.
const PRESETS = [
  { key: 'openai', label: 'OpenAI (GPT)', type: 'openai', baseUrl: '' },
  { key: 'anthropic', label: 'Anthropic (Claude)', type: 'anthropic', baseUrl: '' },
  { key: 'gemini', label: 'Google Gemini', type: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  { key: 'mistral', label: 'Mistral AI (EU)', type: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1' },
  { key: 'xai', label: 'xAI (Grok)', type: 'openai-compatible', baseUrl: 'https://api.x.ai/v1' },
  { key: 'deepseek', label: 'DeepSeek', type: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1' },
  { key: 'groq', label: 'Groq', type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1' },
  { key: 'openrouter', label: 'OpenRouter (viele Modelle)', type: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1' },
  { key: 'together', label: 'Together AI', type: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1' },
  { key: 'perplexity', label: 'Perplexity', type: 'openai-compatible', baseUrl: 'https://api.perplexity.ai' },
  { key: 'azure', label: 'Azure OpenAI', type: 'azure', baseUrl: 'https://IHRE-RESSOURCE.openai.azure.com', apiVersion: '2024-10-21' },
  { key: 'ollama', label: 'Ollama (lokal, im Firmennetz)', type: 'openai-compatible', baseUrl: 'http://ollama:11434/v1', local: true },
  { key: 'vllm', label: 'vLLM / LM Studio / LocalAI (lokal)', type: 'openai-compatible', baseUrl: 'http://localhost:8000/v1', local: true },
  { key: 'custom', label: 'Eigener OpenAI-kompatibler Endpunkt', type: 'openai-compatible', baseUrl: '' },
];

const TYPE_LABEL = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
  'openai-compatible': 'OpenAI-kompatibel',
};

let me = null;

function table(headers, rows, emptyText = 'Keine Einträge.') {
  if (!rows.length) return el('p', { class: 'muted', text: emptyText });
  return el(
    'div',
    { class: 'table-wrap' },
    el('table', { class: 'data' }, el('thead', {}, el('tr', {}, headers.map((h) => el('th', { text: h })))), el('tbody', {}, rows))
  );
}

function section(title, actions, ...content) {
  return el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: title }), el('div', { class: 'card-actions' }, actions || [])), ...content);
}

const btn = (label, onclick, cls = 'btn-ghost') => el('button', { type: 'button', class: `btn btn-sm ${cls}`, text: label, onclick });

// ---------------- Übersicht ----------------
async function renderOverview() {
  const days = Number(sessionStorageGet('fc.days')) || 30;
  const data = await api(`/api/admin/usage?days=${days}`);
  const sel = el('select', { 'aria-label': 'Zeitraum' }, [7, 30, 90, 365].map((d) => el('option', { value: d, text: `Letzte ${d} Tage`, selected: d === days })));
  sel.addEventListener('change', () => {
    sessionStorageSet('fc.days', sel.value);
    show('overview');
  });
  const csv = el('a', { class: 'btn btn-sm btn-ghost', href: `/api/admin/usage.csv?days=${days}`, text: 'CSV-Export' });
  const t = data.totals;
  const stats = el(
    'div',
    { class: 'stats' },
    [
      ['Anfragen', fmtNumber(t.requests)],
      ['Aktive Nutzer', fmtNumber(t.users)],
      ['Input-Tokens', fmtNumber(t.input)],
      ['Output-Tokens', fmtNumber(t.output)],
      ['Schwärzungen', fmtNumber(t.redactions)],
      ['Fehler', fmtNumber(t.errors)],
    ].map(([k, v]) => el('div', { class: 'stat' }, el('div', { class: 'stat-value', text: v }), el('div', { class: 'stat-label', text: k })))
  );

  const max = Math.max(1, ...data.byDay.map((d) => d.tokens || 0));
  const chart = el(
    'div',
    { class: 'bars', role: 'img', 'aria-label': 'Tokens pro Tag' },
    data.byDay.map((d) => {
      const bar = el('div', { class: 'bar', title: `${d.day}: ${fmtNumber(d.tokens)} Tokens, ${d.requests} Anfragen` });
      bar.style.height = `${Math.max(2, Math.round(((d.tokens || 0) / max) * 100))}%`;
      return el('div', { class: 'bar-col' }, bar, el('span', { class: 'bar-label', text: d.day.slice(5) }));
    })
  );

  view.replaceChildren(
    section('Nutzung', [sel, csv], stats, data.byDay.length ? chart : el('p', { class: 'muted', text: 'Noch keine Nutzung im Zeitraum.' })),
    section(
      'Nach Modell',
      null,
      table(
        ['Anbieter', 'Modell', 'Anfragen', 'Input', 'Output'],
        data.byModel.map((r) => el('tr', {}, el('td', { text: r.provider_name }), el('td', { text: r.model_id }), el('td', { class: 'num', text: fmtNumber(r.requests) }), el('td', { class: 'num', text: fmtNumber(r.input) }), el('td', { class: 'num', text: fmtNumber(r.output) })))
      )
    ),
    section(
      'Nach Benutzer',
      null,
      table(
        ['Benutzer', 'Abteilung', 'Anfragen', 'Input', 'Output', 'Schwärzungen'],
        data.byUser.map((r) => el('tr', {}, el('td', { text: r.username }), el('td', { text: r.department || '–' }), el('td', { class: 'num', text: fmtNumber(r.requests) }), el('td', { class: 'num', text: fmtNumber(r.input) }), el('td', { class: 'num', text: fmtNumber(r.output) }), el('td', { class: 'num', text: fmtNumber(r.redactions) })))
      ),
      el('p', { class: 'muted small', text: 'Es werden ausschließlich Metadaten protokolliert. Chat-Inhalte sind für die Verwaltung nicht einsehbar.' })
    )
  );
}

function sessionStorageGet(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k, v) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignorieren */
  }
}

// ---------------- Modelle ----------------
const EFFORT_OPTIONS = [
  { value: '', label: 'Standard des Modells' },
  { value: 'minimal', label: 'minimal (nur OpenAI)' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh (Claude)' },
  { value: 'max', label: 'max (Claude)' },
];

function modelFields(m = {}, providers = []) {
  const fields = [];
  if (!m.id) {
    fields.push({ name: 'providerId', label: 'Anbieter', type: 'select', value: m.providerId, options: providers.map((p) => ({ value: p.id, label: p.name })) });
  }
  fields.push(
    { name: 'modelId', label: 'Modell-ID (wie beim Anbieter, bei Azure: Deployment-Name)', value: m.modelId, required: true, placeholder: 'z. B. claude-opus-5-5, gpt-5, gemini-2.5-pro, llama3.3' },
    { name: 'displayName', label: 'Anzeigename', value: m.displayName, placeholder: 'z. B. Claude Opus 5.5' },
    { name: 'description', label: 'Beschreibung für Mitarbeiter', value: m.description, placeholder: 'z. B. Bestes Modell für komplexe Aufgaben' },
    { name: 'allowedDepartments', label: 'Freigegeben für Abteilungen', value: m.allowedDepartments, help: 'Kommagetrennt, z. B. „IT, Marketing“. Leer = alle Mitarbeiter.' },
    { name: 'maxTokens', label: 'Max. Antwortlänge (Tokens)', type: 'number', value: m.maxTokens ?? '', help: 'Leer = Standard (Claude: 32.000).' },
    { name: 'effort', label: 'Denkaufwand (Reasoning/Effort)', type: 'select', value: m.effort || '', options: EFFORT_OPTIONS, help: 'Nur bei Modellen setzen, die diesen Parameter unterstützen.' },
    { name: 'sortOrder', label: 'Sortierung', type: 'number', value: m.sortOrder ?? 100 },
    { name: 'enabled', label: 'Aktiv (für Mitarbeiter sichtbar)', type: 'checkbox', value: m.enabled ?? true }
  );
  return fields;
}

async function renderModels() {
  const [models, providers] = await Promise.all([api('/api/admin/models'), api('/api/admin/providers')]);
  const add = btn(
    '＋ Modell manuell',
    async () => {
      if (!providers.length) return toast('Bitte zuerst einen Anbieter anlegen.', 'error');
      await formDialog({
        title: 'Modell hinzufügen',
        fields: modelFields({}, providers),
        onSubmit: (v) => api('/api/admin/models', { method: 'POST', body: v }),
      });
      show('models');
    },
    'btn-primary'
  );
  const rows = models.map((m) =>
    el(
      'tr',
      { class: m.enabled ? '' : 'disabled' },
      el('td', {}, el('strong', { text: `${m.local ? '🔒 ' : ''}${m.displayName}` }), el('div', { class: 'muted small', text: m.modelId })),
      el('td', { text: m.providerName }),
      el('td', { text: m.allowedDepartments || 'alle' }),
      el('td', {}, el('span', { class: `pill ${m.enabled ? 'pill-on' : 'pill-off'}`, text: m.enabled ? 'aktiv' : 'inaktiv' })),
      el(
        'td',
        { class: 'actions' },
        btn(m.enabled ? 'Deaktivieren' : 'Aktivieren', async () => {
          await api(`/api/admin/models/${m.id}`, { method: 'PUT', body: { ...m, enabled: !m.enabled } });
          show('models');
        }),
        btn('Bearbeiten', async () => {
          const r = await formDialog({
            title: `Modell bearbeiten: ${m.displayName}`,
            fields: modelFields(m),
            onSubmit: (v) => api(`/api/admin/models/${m.id}`, { method: 'PUT', body: v }),
          });
          if (r) show('models');
        }),
        btn('Löschen', async () => {
          if (await confirmDialog(`Modell „${m.displayName}“ entfernen?`)) {
            await api(`/api/admin/models/${m.id}`, { method: 'DELETE' });
            show('models');
          }
        }, 'btn-ghost danger')
      )
    )
  );
  view.replaceChildren(
    section(
      'Freigegebene Modelle',
      [add],
      el('p', { class: 'muted small', text: 'Tipp: Unter „Anbieter“ → „Modelle abrufen“ lassen sich alle verfügbaren Modelle eines Anbieters mit einem Klick übernehmen.' }),
      table(['Modell', 'Anbieter', 'Abteilungen', 'Status', ''], rows, 'Noch keine Modelle. Legen Sie zuerst einen Anbieter an.')
    )
  );
}

// ---------------- Anbieter ----------------
function providerFields(p = {}) {
  return [
    { name: 'name', label: 'Name', value: p.name, required: true },
    {
      name: 'type', label: 'Protokoll', type: 'select', value: p.type || 'openai-compatible',
      options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
    { name: 'baseUrl', label: 'Basis-URL', value: p.baseUrl, help: 'Leer = Standard-Endpunkt (OpenAI/Anthropic). Für Gateways, Proxys und lokale Server ausfüllen.' },
    {
      name: 'apiKey', label: p.id ? 'Neuer API-Schlüssel (leer = unverändert)' : 'API-Schlüssel', type: 'password', autocomplete: 'new-password',
      help: 'Wird verschlüsselt (AES-256-GCM) gespeichert und nie wieder angezeigt. Für lokale Server meist leer lassen.',
    },
    { name: 'apiVersion', label: 'API-Version (nur Azure)', value: p.options?.apiVersion || '', placeholder: '2024-10-21' },
    { name: 'local', label: '🔒 Lokal / im Firmennetz (Daten verlassen das Unternehmen nicht – kein Schwärzen nötig)', type: 'checkbox', value: p.local },
    { name: 'enabled', label: 'Aktiv', type: 'checkbox', value: p.enabled ?? true },
  ];
}

const providerBody = (v) => ({
  name: v.name, type: v.type, baseUrl: v.baseUrl, apiKey: v.apiKey, local: v.local, enabled: v.enabled,
  options: { apiVersion: v.apiVersion },
});

async function addProvider() {
  const preset = await formDialog({
    title: 'Anbieter hinzufügen – Vorlage wählen',
    submitLabel: 'Weiter',
    fields: [{ name: 'preset', label: 'Vorlage', type: 'select', value: 'openai', options: PRESETS.map((p) => ({ value: p.key, label: p.label })) }],
  });
  if (!preset) return;
  const p = PRESETS.find((x) => x.key === preset.preset);
  const r = await formDialog({
    title: `Anbieter hinzufügen: ${p.label}`,
    fields: providerFields({ name: p.label.replace(/ \(.*\)$/, ''), type: p.type, baseUrl: p.baseUrl, local: p.local, options: { apiVersion: p.apiVersion } }),
    onSubmit: (v) => api('/api/admin/providers', { method: 'POST', body: providerBody(v) }),
  });
  if (r) {
    toast('Anbieter angelegt. Jetzt „Modelle abrufen“ nutzen.');
    show('providers');
  }
}

async function discover(p) {
  let list;
  try {
    list = await api(`/api/admin/providers/${p.id}/discover`, { method: 'POST', body: {} });
  } catch (ex) {
    return toast(ex.message, 'error');
  }
  if (!list.length) return toast('Der Anbieter hat keine Modelle gemeldet.', 'error');
  const filter = el('input', { type: 'search', placeholder: 'Filtern …', class: 'filter' });
  const boxes = list.map((m) => {
    const cb = el('input', { type: 'checkbox', value: m.id, disabled: m.added });
    const label = el('label', { class: 'check model-check' }, cb, ` ${m.id}`, m.name !== m.id ? el('span', { class: 'muted', text: ` – ${m.name}` }) : null, m.added ? el('span', { class: 'pill pill-on', text: 'bereits übernommen' }) : null);
    return { m, cb, label };
  });
  const listBox = el('div', { class: 'model-list' }, boxes.map((b) => b.label));
  filter.addEventListener('input', () => {
    const q = filter.value.toLowerCase();
    for (const b of boxes) b.label.hidden = q && !b.m.id.toLowerCase().includes(q);
  });
  const r = await formDialog({
    title: `Modelle von ${p.name} übernehmen`,
    submitLabel: 'Ausgewählte übernehmen',
    fields: [{ name: 'allowedDepartments', label: 'Freigeben für Abteilungen (leer = alle)', value: '' }],
    extra: () => el('div', {}, filter, listBox),
    onSubmit: async (v) => {
      const chosen = boxes.filter((b) => b.cb.checked && !b.cb.disabled).map((b) => b.m);
      if (!chosen.length) throw new Error('Bitte mindestens ein Modell auswählen.');
      await api('/api/admin/models', {
        method: 'POST',
        body: { providerId: p.id, models: chosen.map((m) => ({ modelId: m.id, displayName: m.name, allowedDepartments: v.allowedDepartments })) },
      });
      return chosen.length;
    },
  });
  if (r) {
    toast(`${r} Modell(e) übernommen.`);
    show('models');
  }
}

async function testProvider(p) {
  const r = await formDialog({
    title: `Verbindung testen: ${p.name}`,
    submitLabel: 'Test senden',
    fields: [{ name: 'modelId', label: 'Modell-ID', required: true, placeholder: 'z. B. claude-haiku-5-5 oder gpt-5-mini' }],
    onSubmit: (v) => api(`/api/admin/providers/${p.id}/test`, { method: 'POST', body: v }),
  });
  if (r?.ok) toast(`Verbindung OK. Antwort: „${r.reply}“`);
}

async function renderProviders() {
  const providers = await api('/api/admin/providers');
  const rows = providers.map((p) =>
    el(
      'tr',
      { class: p.enabled ? '' : 'disabled' },
      el('td', {}, el('strong', { text: `${p.local ? '🔒 ' : ''}${p.name}` }), el('div', { class: 'muted small', text: p.baseUrl || 'Standard-Endpunkt' })),
      el('td', { text: TYPE_LABEL[p.type] }),
      el('td', { text: p.hasKey ? '•••••• (verschlüsselt)' : '–' }),
      el('td', {}, el('span', { class: `pill ${p.local ? 'pill-on' : 'pill-warn'}`, text: p.local ? 'lokal' : 'extern' })),
      el(
        'td',
        { class: 'actions' },
        btn('Modelle abrufen', () => discover(p), 'btn-primary'),
        btn('Testen', () => testProvider(p)),
        btn('Bearbeiten', async () => {
          const r = await formDialog({
            title: `Anbieter bearbeiten: ${p.name}`,
            fields: providerFields(p),
            onSubmit: (v) => api(`/api/admin/providers/${p.id}`, { method: 'PUT', body: providerBody(v) }),
          });
          if (r) show('providers');
        }),
        btn('Löschen', async () => {
          if (await confirmDialog(`Anbieter „${p.name}“ und alle zugehörigen Modelle löschen?`)) {
            await api(`/api/admin/providers/${p.id}`, { method: 'DELETE' });
            show('providers');
          }
        }, 'btn-ghost danger')
      )
    )
  );
  view.replaceChildren(
    section(
      'KI-Anbieter',
      [btn('＋ Anbieter hinzufügen', addProvider, 'btn-primary')],
      el('p', { class: 'muted small', text: 'Unterstützt werden Anthropic (Claude), OpenAI, Azure OpenAI sowie alle OpenAI-kompatiblen APIs – darunter Google Gemini, Mistral, xAI, DeepSeek, Groq, OpenRouter und lokale Server wie Ollama oder vLLM.' }),
      table(['Anbieter', 'Protokoll', 'API-Schlüssel', 'Datenfluss', ''], rows, 'Noch keine Anbieter angelegt.')
    )
  );
}

// ---------------- Benutzer ----------------
function userFields(u = {}) {
  const f = [];
  if (!u.id) f.push({ name: 'username', label: 'Benutzername', required: true, value: '' });
  f.push(
    { name: 'displayName', label: 'Anzeigename', value: u.displayName },
    { name: 'department', label: 'Abteilung', value: u.department, help: 'Steuert, welche Modelle freigegeben sind.' },
    { name: 'role', label: 'Rolle', type: 'select', value: u.role || 'user', options: [{ value: 'user', label: 'Mitarbeiter' }, { value: 'admin', label: 'Administrator' }] },
    { name: 'dailyTokenLimit', label: 'Tägliches Token-Limit', type: 'number', value: u.dailyTokenLimit ?? '', help: 'Leer = Standard aus den Richtlinien, 0 = unbegrenzt.' },
    {
      name: 'password', label: u.id ? 'Neues Passwort setzen (leer = unverändert)' : 'Startpasswort', type: 'password', autocomplete: 'new-password',
      required: !u.id, help: 'Der Benutzer muss es bei der nächsten Anmeldung ändern.',
    }
  );
  if (u.id) f.push({ name: 'active', label: 'Konto aktiv', type: 'checkbox', value: u.active });
  return f;
}

async function renderUsers() {
  const users = await api('/api/admin/users');
  const rows = users.map((u) =>
    el(
      'tr',
      { class: u.active ? '' : 'disabled' },
      el('td', {}, el('strong', { text: u.displayName }), el('div', { class: 'muted small', text: u.username })),
      el('td', { text: u.department || '–' }),
      el('td', { text: u.role === 'admin' ? 'Administrator' : 'Mitarbeiter' }),
      el('td', { text: u.dailyTokenLimit === null ? 'Standard' : u.dailyTokenLimit === 0 ? 'unbegrenzt' : fmtNumber(u.dailyTokenLimit) }),
      el('td', { text: fmtDate(u.lastLogin) }),
      el('td', {}, el('span', { class: `pill ${u.active ? 'pill-on' : 'pill-off'}`, text: u.active ? 'aktiv' : 'gesperrt' })),
      el(
        'td',
        { class: 'actions' },
        btn('Bearbeiten', async () => {
          const r = await formDialog({
            title: `Benutzer bearbeiten: ${u.username}`,
            fields: userFields(u),
            onSubmit: (v) => api(`/api/admin/users/${u.id}`, { method: 'PUT', body: v }),
          });
          if (r) show('users');
        }),
        u.id !== me.id
          ? btn('Löschen', async () => {
              if (await confirmDialog(`Benutzer „${u.username}“ und alle seine Chats löschen?`)) {
                await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                show('users');
              }
            }, 'btn-ghost danger')
          : null
      )
    )
  );
  view.replaceChildren(
    section(
      'Benutzer',
      [
        btn('＋ Benutzer anlegen', async () => {
          const r = await formDialog({
            title: 'Benutzer anlegen',
            fields: userFields(),
            onSubmit: (v) => api('/api/admin/users', { method: 'POST', body: v }),
          });
          if (r) show('users');
        }, 'btn-primary'),
      ],
      table(['Name', 'Abteilung', 'Rolle', 'Token-Limit/Tag', 'Letzte Anmeldung', 'Status', ''], rows)
    )
  );
}

// ---------------- Richtlinien ----------------
async function renderPolicies() {
  const s = await api('/api/admin/settings');
  const form = el('form', { class: 'policy-form' });
  const field = (name, label, input, help) => {
    input.name = name;
    input.id = `p_${name}`;
    return el('div', { class: 'field' }, el('label', { for: input.id, text: label }), input, help ? el('small', { class: 'help', text: help }) : null);
  };
  const ta = (v, rows = 4) => {
    const t = el('textarea', { rows });
    t.value = v;
    return t;
  };
  const num = (v) => {
    const i = el('input', { type: 'number', min: 0 });
    i.value = v;
    return i;
  };
  const check = (name, label, v, help) => {
    const i = el('input', { type: 'checkbox', name, id: `p_${name}` });
    i.checked = v === '1';
    return el('div', { class: 'field' }, el('label', { class: 'check', for: i.id }, i, ` ${label}`), help ? el('small', { class: 'help', text: help }) : null);
  };

  form.append(
    el('h3', { text: 'Datenschutz' }),
    check('redact_pii', 'Personenbezogene Daten vor externen Anbietern automatisch schwärzen', s.redact_pii, 'E-Mail-Adressen, Telefonnummern, IBAN, Kreditkarten- und Sozialversicherungsnummern werden durch Platzhalter ersetzt. Lokale Modelle (🔒) sind ausgenommen.'),
    field('redact_terms', 'Zusätzlich zu schwärzende Begriffe (einer pro Zeile)', ta(s.redact_terms), 'z. B. Kundennamen, Projekt-Codenamen. Groß-/Kleinschreibung egal.'),
    field('block_terms', 'Gesperrte Begriffe für externe Anbieter (einer pro Zeile)', ta(s.block_terms), 'Enthält eine Nachricht einen dieser Begriffe, wird sie nicht an externe Anbieter gesendet.'),
    el('h3', { text: 'Speicherung & Aufbewahrung' }),
    check('store_chats', 'Chatverläufe auf dem Server speichern', s.store_chats, 'Deaktiviert: Verläufe existieren nur im Browser-Tab; bestehende gespeicherte Chats werden gelöscht.'),
    field('retention_days', 'Chats löschen nach … Tagen Inaktivität (0 = nie)', num(s.retention_days)),
    field('usage_retention_days', 'Nutzungs- und Audit-Protokoll aufbewahren (Tage, 0 = unbegrenzt)', num(s.usage_retention_days)),
    el('h3', { text: 'Kontingente' }),
    field('default_daily_tokens', 'Standard-Tageslimit je Mitarbeiter (Tokens, 0 = unbegrenzt)', num(s.default_daily_tokens), 'Kann pro Benutzer überschrieben werden.'),
    el('h3', { text: 'Assistent' }),
    field('system_prompt', 'System-Prompt (gilt für alle Modelle)', ta(s.system_prompt, 6), 'Legt Verhalten, Sprache und Regeln des Assistenten fest.'),
    field('banner_text', 'Hinweisbanner im Chat', ta(s.banner_text, 2), 'Leer = kein Banner.'),
    el('div', { class: 'dialog-actions' }, el('button', { type: 'submit', class: 'btn btn-primary', text: 'Richtlinien speichern' }))
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const input of form.querySelectorAll('[name]')) body[input.name] = input.type === 'checkbox' ? (input.checked ? '1' : '0') : input.value;
    if (body.store_chats === '0' && s.store_chats === '1') {
      if (!(await confirmDialog('Speicherung deaktivieren? Alle gespeicherten Chats aller Mitarbeiter werden sofort gelöscht.', 'Deaktivieren & löschen'))) return;
    }
    try {
      await api('/api/admin/settings', { method: 'PUT', body });
      toast('Richtlinien gespeichert.');
      show('policies');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
  view.replaceChildren(section('Richtlinien', null, form));
}

// ---------------- Protokoll ----------------
const ACTION_LABEL = {
  login: 'Anmeldung',
  'login.failed': 'Fehlgeschlagene Anmeldung',
  'password.changed': 'Passwort geändert',
  'user.created': 'Benutzer angelegt',
  'user.updated': 'Benutzer geändert',
  'user.deleted': 'Benutzer gelöscht',
  'user.password_reset': 'Passwort zurückgesetzt',
  'provider.created': 'Anbieter angelegt',
  'provider.updated': 'Anbieter geändert',
  'provider.deleted': 'Anbieter gelöscht',
  'model.created': 'Modell(e) hinzugefügt',
  'model.updated': 'Modell geändert',
  'model.deleted': 'Modell entfernt',
  'settings.updated': 'Richtlinien geändert',
  'usage.exported': 'Nutzung exportiert',
  'chat.blocked': 'Nachricht blockiert',
  bootstrap: 'Ersteinrichtung',
};

async function renderAudit() {
  const rows = await api('/api/admin/audit?limit=500');
  view.replaceChildren(
    section(
      'Audit-Protokoll',
      [btn('Aktualisieren', () => show('audit'))],
      table(
        ['Zeitpunkt', 'Wer', 'Aktion', 'Details', 'IP'],
        rows.map((r) => el('tr', {}, el('td', { text: fmtDate(r.created_at) }), el('td', { text: r.actor_name }), el('td', { text: ACTION_LABEL[r.action] || r.action }), el('td', { class: 'wrap', text: r.details }), el('td', { class: 'muted', text: r.ip })))
      )
    )
  );
}

// ---------------- Navigation ----------------
const RENDER = {
  overview: renderOverview,
  models: renderModels,
  providers: renderProviders,
  users: renderUsers,
  policies: renderPolicies,
  audit: renderAudit,
};

async function show(tab) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  try {
    await RENDER[tab]();
  } catch (ex) {
    view.replaceChildren(el('p', { class: 'form-error', text: ex.message }));
  }
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
}

async function init() {
  me = await api('/api/me');
  if (me.role !== 'admin') {
    location.href = '/';
    return;
  }
  document.getElementById('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) show(b.dataset.tab);
  });
  document.getElementById('logout').addEventListener('click', logout);
  window.addEventListener('hashchange', () => {
    const tab = location.hash.slice(1);
    if (RENDER[tab]) show(tab);
  });
  const initial = location.hash.slice(1);
  show(RENDER[initial] ? initial : 'overview');
}

init();

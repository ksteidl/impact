import { api, el, toast, fmtNumber, logout, formDialog, confirmDialog } from './common.js';
import { renderMarkdown } from './markdown.js';

const $ = (id) => document.getElementById(id);
const MAX_FILE_BYTES = 500 * 1024;

const state = {
  me: null,
  models: [],
  conversations: [],
  convId: null,
  messages: [], // { role, content, model_label }
  attachments: [], // { name, text }
  controller: null,
};

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};

// ---------------- Initialisierung ----------------
async function init() {
  try {
    state.me = await api('/api/me');
  } catch {
    return;
  }
  if (state.me.mustChangePassword) {
    location.href = '/login?pw=1';
    return;
  }
  $('user-name').textContent = state.me.displayName;
  $('admin-link').hidden = state.me.role !== 'admin';
  if (state.me.bannerText) {
    $('banner').textContent = state.me.bannerText;
    $('banner').hidden = false;
  }
  $('composer-hint').textContent = state.me.storeChats
    ? `Chats werden gespeichert und nach ${state.me.retentionDays || '∞'} Tagen Inaktivität gelöscht. KI kann Fehler machen – wichtige Angaben prüfen.`
    : 'Chats werden nicht gespeichert – beim Neuladen der Seite ist der Verlauf weg. KI kann Fehler machen.';
  updateQuota(state.me.usageToday);

  state.models = await api('/api/models');
  fillModels();
  if (state.me.storeChats) await loadConversations();
  else {
    $('conv-list').append(el('p', { class: 'muted small', text: 'Die Speicherung von Chats ist durch die Verwaltung deaktiviert.' }));
    $('conv-filter').hidden = true;
  }
  bindEvents();
  $('input').focus();
}

function fillModels() {
  const sel = $('model-select');
  sel.textContent = '';
  if (!state.models.length) {
    sel.append(el('option', { value: '', text: 'Keine Modelle freigegeben' }));
    $('send').disabled = true;
    $('empty-hint').textContent = 'Für Ihr Konto sind noch keine Modelle freigegeben. Bitte wenden Sie sich an die IT.';
    return;
  }
  const groups = new Map();
  for (const m of state.models) {
    const key = m.local ? '🔒 Lokal (Daten bleiben im Firmennetz)' : `Extern – ${m.provider}`;
    if (!groups.has(key)) groups.set(key, el('optgroup', { label: key }));
    groups.get(key).append(el('option', { value: m.id, text: `${m.local ? '🔒 ' : ''}${m.name}` }));
  }
  for (const g of groups.values()) sel.append(g);
  const saved = store.get('fc.model');
  if (saved && state.models.some((m) => String(m.id) === saved)) sel.value = saved;
  updateModelBadge();
}

function currentModel() {
  return state.models.find((m) => String(m.id) === $('model-select').value);
}

function updateModelBadge() {
  const m = currentModel();
  const badge = $('model-badge');
  if (!m) {
    badge.textContent = '';
    return;
  }
  badge.textContent = m.local ? '🔒 Lokal' : 'Extern';
  badge.className = `badge ${m.local ? 'badge-local' : 'badge-external'}`;
  badge.title = m.local
    ? 'Dieses Modell läuft im Firmennetz. Daten verlassen das Unternehmen nicht.'
    : `Dieses Modell läuft bei ${m.provider}. Personenbezogene Daten werden ggf. automatisch geschwärzt.`;
  const hint = $('empty-hint');
  if (hint) hint.textContent = m.description || '';
}

function updateQuota(used) {
  const limit = state.me.dailyLimit;
  $('quota').textContent = limit
    ? `Heute: ${fmtNumber(used)} / ${fmtNumber(limit)} Tokens`
    : `Heute: ${fmtNumber(used)} Tokens`;
}

// ---------------- Unterhaltungen ----------------
async function loadConversations() {
  state.conversations = await api('/api/conversations');
  renderConversations();
}

function renderConversations() {
  const list = $('conv-list');
  list.textContent = '';
  const filter = $('conv-filter').value.trim().toLowerCase();
  const items = state.conversations.filter((c) => !filter || c.title.toLowerCase().includes(filter));
  if (!items.length) {
    list.append(el('p', { class: 'muted small', text: filter ? 'Keine Treffer.' : 'Noch keine Chats.' }));
    return;
  }
  for (const c of items) {
    const row = el(
      'div',
      { class: `conv ${c.id === state.convId ? 'active' : ''}` },
      el('button', { type: 'button', class: 'conv-title', text: c.title, title: c.title, onclick: () => openConversation(c.id) }),
      el('button', {
        type: 'button', class: 'conv-act', title: 'Umbenennen', 'aria-label': 'Umbenennen', text: '✎',
        onclick: () => renameConversation(c),
      }),
      el('button', {
        type: 'button', class: 'conv-act', title: 'Löschen', 'aria-label': 'Löschen', text: '🗑',
        onclick: () => deleteConversation(c),
      })
    );
    list.append(row);
  }
}

async function openConversation(id) {
  if (state.controller) return toast('Bitte warten, bis die Antwort fertig ist.');
  const conv = await api(`/api/conversations/${encodeURIComponent(id)}`);
  state.convId = conv.id;
  state.messages = conv.messages;
  if (conv.model_ref && state.models.some((m) => m.id === conv.model_ref)) {
    $('model-select').value = String(conv.model_ref);
    updateModelBadge();
  }
  renderAll();
  renderConversations();
  closeSidebarOnMobile();
}

async function renameConversation(c) {
  await formDialog({
    title: 'Chat umbenennen',
    fields: [{ name: 'title', label: 'Titel', value: c.title, required: true }],
    onSubmit: async (v) => {
      await api(`/api/conversations/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { title: v.title } });
      c.title = v.title.trim();
      renderConversations();
    },
  });
}

async function deleteConversation(c) {
  if (!(await confirmDialog(`Chat „${c.title}“ endgültig löschen?`))) return;
  await api(`/api/conversations/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
  if (state.convId === c.id) newChat();
  await loadConversations();
}

function newChat() {
  if (state.controller) state.controller.abort();
  state.convId = null;
  state.messages = [];
  state.attachments = [];
  renderAttachments();
  renderAll();
  renderConversations();
  $('input').focus();
  closeSidebarOnMobile();
}

// ---------------- Darstellung ----------------
function messageNode(msg) {
  const body = el('div', { class: 'msg-body' });
  if (msg.role === 'assistant') {
    body.innerHTML = renderMarkdown(msg.content); // sicher: renderMarkdown escaped den gesamten Text
  } else {
    body.textContent = msg.content;
  }
  const actions = el('div', { class: 'msg-actions' });
  if (msg.role === 'assistant') {
    actions.append(
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Kopieren', onclick: () => copyText(msg.content) })
    );
  }
  const meta = el('div', { class: 'msg-meta', text: msg.role === 'user' ? 'Sie' : msg.model_label || 'Assistent' });
  return el('article', { class: `msg msg-${msg.role}` }, meta, body, actions);
}

function renderAll() {
  const box = $('messages');
  box.textContent = '';
  if (!state.messages.length) {
    box.append($('empty') || buildEmpty());
    $('empty').hidden = false;
    return;
  }
  for (const m of state.messages) box.append(messageNode(m));
  scrollToBottom(true);
}

function buildEmpty() {
  return el('div', { class: 'empty', id: 'empty' }, el('h1', { text: 'Wie kann ich helfen?' }), el('p', { class: 'muted', id: 'empty-hint', text: currentModel()?.description || '' }));
}

function scrollToBottom(force = false) {
  const box = $('messages');
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  if (force || near) box.scrollTop = box.scrollHeight;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('In die Zwischenablage kopiert.');
  } catch {
    toast('Kopieren nicht möglich.', 'error');
  }
}

// ---------------- Anhänge ----------------
async function addFiles(files) {
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      toast(`${f.name}: Datei zu groß (max. 500 KB).`, 'error');
      continue;
    }
    const text = await f.text();
    if (/\u0000/.test(text.slice(0, 2000))) {
      toast(`${f.name}: Nur Textdateien werden unterstützt.`, 'error');
      continue;
    }
    state.attachments.push({ name: f.name, text });
  }
  renderAttachments();
}

function renderAttachments() {
  const box = $('attachments');
  box.textContent = '';
  state.attachments.forEach((a, idx) => {
    box.append(
      el(
        'span',
        { class: 'chip' },
        `📄 ${a.name}`,
        el('button', {
          type: 'button', 'aria-label': `${a.name} entfernen`, text: '×',
          onclick: () => {
            state.attachments.splice(idx, 1);
            renderAttachments();
          },
        })
      )
    );
  });
}

// ---------------- Senden & Streaming ----------------
async function send() {
  const input = $('input');
  let text = input.value.trim();
  const model = currentModel();
  if ((!text && !state.attachments.length) || !model || state.controller) return;

  for (const a of state.attachments) {
    text += `\n\n--- Datei: ${a.name} ---\n\`\`\`\n${a.text}\n\`\`\``;
  }
  text = text.trim();
  const history = state.me.storeChats ? undefined : state.messages.map(({ role, content }) => ({ role, content }));

  input.value = '';
  autoGrow();
  state.attachments = [];
  renderAttachments();
  $('empty')?.remove();

  const userMsg = { role: 'user', content: text };
  state.messages.push(userMsg);
  const userNode = messageNode(userMsg);
  $('messages').append(userNode);

  const botMsg = { role: 'assistant', content: '', model_label: model.name };
  const botNode = messageNode(botMsg);
  botNode.classList.add('streaming');
  const body = botNode.querySelector('.msg-body');
  body.append(el('span', { class: 'typing', 'aria-label': 'Antwort wird erstellt' }, el('i'), el('i'), el('i')));
  $('messages').append(botNode);
  scrollToBottom(true);

  setBusy(true);
  const controller = new AbortController();
  state.controller = controller;

  let pending = false;
  const paint = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      body.innerHTML = renderMarkdown(botMsg.content);
      scrollToBottom();
    });
  };

  const notes = [];
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'firmen-chat' },
      body: JSON.stringify({ modelId: model.id, message: text, conversationId: state.convId, history }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) location.href = '/login';
      throw new Error(data.error || `Fehler ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!chunk.startsWith('data: ')) continue;
        const ev = JSON.parse(chunk.slice(6));
        if (ev.type === 'start') {
          if (ev.conversationId && !state.convId) {
            state.convId = ev.conversationId;
            state.conversations.unshift({ id: ev.conversationId, title: ev.title, updated_at: Date.now() });
            renderConversations();
          }
          if (ev.redactions > 0) {
            userNode.append(
              el('div', {
                class: 'msg-note',
                text: `🛡 ${ev.redactions} personenbezogene Angabe(n) wurden vor dem Senden an den externen Anbieter geschwärzt.`,
              })
            );
          }
        } else if (ev.type === 'delta') {
          botMsg.content += ev.text;
          paint();
        } else if (ev.type === 'notice') notes.push(ev.text);
        else if (ev.type === 'error') throw new Error(ev.error);
        else if (ev.type === 'done') {
          state.me.usageToday += (ev.usage?.input || 0) + (ev.usage?.output || 0);
          updateQuota(state.me.usageToday);
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') notes.push(`⚠ ${err.message}`);
    else notes.push('Abgebrochen.');
  } finally {
    state.controller = null;
    setBusy(false);
    botNode.classList.remove('streaming');
    body.innerHTML = renderMarkdown(botMsg.content);
    if (botMsg.content) state.messages.push(botMsg);
    else if (!notes.length) notes.push('Keine Antwort erhalten.');
    for (const n of notes) botNode.querySelector('.msg-body').append(el('div', { class: 'msg-note', text: n }));
    if (state.me.storeChats) {
      const c = state.conversations.find((x) => x.id === state.convId);
      if (c) {
        c.updated_at = Date.now();
        state.conversations = [c, ...state.conversations.filter((x) => x !== c)];
        renderConversations();
      }
    }
    scrollToBottom();
    $('input').focus();
  }
}

function setBusy(busy) {
  $('send').hidden = busy;
  $('stop').hidden = !busy;
}

function autoGrow() {
  const t = $('input');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 260)}px`;
}

function closeSidebarOnMobile() {
  if (window.matchMedia('(max-width: 800px)').matches) document.body.classList.remove('sidebar-open');
}

// ---------------- Ereignisse ----------------
function bindEvents() {
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });
  $('stop').addEventListener('click', () => state.controller?.abort());
  $('new-chat').addEventListener('click', newChat);
  $('conv-filter').addEventListener('input', renderConversations);
  $('model-select').addEventListener('change', () => {
    store.set('fc.model', $('model-select').value);
    updateModelBadge();
  });
  $('file-input').addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
  $('logout').addEventListener('click', logout);
  $('toggle-sidebar').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  $('change-pw').addEventListener('click', changePassword);
  // Kopieren-Buttons in Codeblöcken
  $('messages').addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-code');
    if (btn) copyText(btn.closest('.codeblock').querySelector('code').textContent);
  });
  // Drag & Drop von Dateien
  const main = document.querySelector('.chat-main');
  main.addEventListener('dragover', (e) => e.preventDefault());
  main.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]);
  });
}

async function changePassword() {
  await formDialog({
    title: 'Passwort ändern',
    fields: [
      { name: 'currentPassword', label: 'Aktuelles Passwort', type: 'password', required: true, autocomplete: 'current-password' },
      { name: 'newPassword', label: 'Neues Passwort', type: 'password', required: true, autocomplete: 'new-password',
        help: 'Mind. 10 Zeichen, 3 von: Klein-, Großbuchstaben, Ziffern, Sonderzeichen.' },
      { name: 'repeat', label: 'Neues Passwort wiederholen', type: 'password', required: true, autocomplete: 'new-password' },
    ],
    onSubmit: async (v) => {
      if (v.newPassword !== v.repeat) throw new Error('Die neuen Passwörter stimmen nicht überein.');
      await api('/api/me/password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
      toast('Passwort geändert.');
    },
  });
}

init();

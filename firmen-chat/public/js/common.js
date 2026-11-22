// Gemeinsame Hilfsfunktionen für alle Seiten.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'X-Requested-With': 'firmen-chat',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json();
  if (res.status === 401 && !path.endsWith('/login')) {
    location.href = '/login';
    throw new Error('Nicht angemeldet.');
  }
  if (res.status === 403 && data?.mustChangePassword) {
    location.href = '/login?pw=1';
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(data?.error || `Fehler ${res.status}`);
  return data;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(message, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = el('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = el('div', { class: `toast toast-${kind}`, text: message });
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

export function fmtNumber(n) {
  return new Intl.NumberFormat('de-AT').format(Number(n) || 0);
}

export function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
}

export async function logout() {
  try {
    await api('/api/logout', { method: 'POST', body: {} });
  } finally {
    location.href = '/login';
  }
}

/** Einfacher modaler Dialog mit Formular. fields: [{name,label,type,value,options,help,required}] */
export function formDialog({ title, fields, submitLabel = 'Speichern', onSubmit, extra }) {
  return new Promise((resolve) => {
    const form = el('form', { class: 'dialog-form', method: 'dialog' });
    form.append(el('h2', { text: title }));
    const inputs = {};
    for (const f of fields) {
      const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
      let input;
      if (f.type === 'select') {
        input = el('select', { id, name: f.name });
        for (const o of f.options) {
          const opt = el('option', { value: o.value, text: o.label });
          if (String(o.value) === String(f.value ?? '')) opt.selected = true;
          input.append(opt);
        }
      } else if (f.type === 'textarea') {
        input = el('textarea', { id, name: f.name, rows: f.rows || 4 });
        input.value = f.value ?? '';
      } else if (f.type === 'checkbox') {
        input = el('input', { id, name: f.name, type: 'checkbox' });
        input.checked = !!f.value;
      } else {
        input = el('input', { id, name: f.name, type: f.type || 'text', placeholder: f.placeholder, autocomplete: f.autocomplete || 'off' });
        input.value = f.value ?? '';
      }
      if (f.required) input.required = true;
      inputs[f.name] = input;
      const row =
        f.type === 'checkbox'
          ? el('label', { class: 'check', for: id }, input, ' ', f.label)
          : el('div', { class: 'field' }, el('label', { for: id, text: f.label }), input);
      if (f.help) row.append(el('small', { class: 'help', text: f.help }));
      form.append(row);
    }
    if (extra) form.append(extra(inputs));
    const err = el('div', { class: 'form-error', role: 'alert' });
    const cancel = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Abbrechen' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary', text: submitLabel });
    form.append(err, el('div', { class: 'dialog-actions' }, cancel, submit));
    const dlg = el('dialog', { class: 'dialog' }, form);
    document.body.append(dlg);
    const close = (val) => {
      dlg.close();
      dlg.remove();
      resolve(val);
    };
    cancel.addEventListener('click', () => close(null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      for (const [k, input] of Object.entries(inputs)) values[k] = input.type === 'checkbox' ? input.checked : input.value;
      submit.disabled = true;
      err.textContent = '';
      try {
        const result = onSubmit ? await onSubmit(values) : values;
        close(result ?? values);
      } catch (ex) {
        err.textContent = ex.message;
        submit.disabled = false;
      }
    });
    dlg.showModal();
    form.querySelector('input:not([type=checkbox]),textarea,select')?.focus();
  });
}

export function confirmDialog(message, confirmLabel = 'Löschen') {
  return new Promise((resolve) => {
    const yes = el('button', { class: 'btn btn-danger', type: 'button', text: confirmLabel });
    const no = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Abbrechen' });
    const dlg = el('dialog', { class: 'dialog' }, el('p', { text: message }), el('div', { class: 'dialog-actions' }, no, yes));
    document.body.append(dlg);
    const close = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    yes.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    dlg.addEventListener('cancel', () => close(false));
    dlg.showModal();
    no.focus();
  });
}

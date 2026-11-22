import { api } from './common.js';

const loginForm = document.getElementById('login-form');
const pwForm = document.getElementById('pw-form');

function showPasswordForm() {
  loginForm.hidden = true;
  pwForm.hidden = false;
  document.getElementById('pw-current').focus();
}

if (new URLSearchParams(location.search).has('pw')) showPasswordForm();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const r = await api('/api/login', {
      method: 'POST',
      body: { username: loginForm.username.value, password: loginForm.password.value },
    });
    if (r.mustChangePassword) {
      document.getElementById('pw-current').value = loginForm.password.value;
      showPasswordForm();
      document.getElementById('pw-new').focus();
    } else location.href = '/';
  } catch (ex) {
    err.textContent = ex.message;
  }
});

pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('pw-error');
  err.textContent = '';
  const newPassword = document.getElementById('pw-new').value;
  if (newPassword !== document.getElementById('pw-repeat').value) {
    err.textContent = 'Die neuen Passwörter stimmen nicht überein.';
    return;
  }
  try {
    await api('/api/me/password', {
      method: 'POST',
      body: { currentPassword: document.getElementById('pw-current').value, newPassword },
    });
    location.href = '/';
  } catch (ex) {
    err.textContent = ex.message;
  }
});

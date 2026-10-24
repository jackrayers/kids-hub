// Tiny client for the Kids Hub API. Shared by kid screens and parent mode.

export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

export const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* ignore */ } },
  remove(key) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } },
};

const TOKEN_KEY = 'kh.deviceToken';
export const deviceToken = {
  get: () => store.get(TOKEN_KEY),
  set: (t) => store.set(TOKEN_KEY, t),
  clear: () => store.remove(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body instanceof Blob) {
    init.body = body;
    init.headers['content-type'] = body.type;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Can’t reach the internet right now');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

/** Calls /api/kid/* as the paired device. Unpaired → bounce to /pair/. */
export async function kidApi(path, opts = {}) {
  const token = deviceToken.get();
  if (!token) { location.href = '/pair/'; throw new ApiError(401, 'Not paired'); }
  try {
    return await request(`/api/kid${path}`, { ...opts, headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    if (err.status === 401) { deviceToken.clear(); location.href = '/pair/'; }
    throw err;
  }
}

/** Calls /api/admin/* using the Cloudflare Access session cookie. */
export const adminApi = (path, opts) => request(`/api/admin${path}`, opts);

export const pairDevice = (code) => request('/api/pair', { method: 'POST', body: { code } });

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Avatar markup: photo if present, otherwise emoji (or initial) on the kid's color. */
export function avatarHtml(kid, extraClass = '') {
  const style = `--tile:${esc(kid.color || '#f5b82e')}`;
  const inner = kid.avatar_url
    ? `<img src="${esc(kid.avatar_url)}" alt="">`
    : esc(kid.emoji || (kid.name || '?').slice(0, 1).toUpperCase());
  return `<span class="avatar ${extraClass}" style="${style}" aria-hidden="true">${inner}</span>`;
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

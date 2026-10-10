// API client: every response is { ok, data } or { ok: false, error: { message, field } }.
// The session lives for this browser tab (sessionStorage), like the original page.
const KEY = 'sanjeevani.session';
let session = null;
try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { session = null; }
let onExpired = () => {};

export const auth = {
  get user() { return session?.user || null; },
  set(s) { session = s; try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } },
  clear() { session = null; try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
  onExpired(fn) { onExpired = fn; },
};

async function call(method, url, body, signal, raw) {
  let res;
  try {
    res = await fetch(url, { method, signal, headers: { 'Content-Type': raw ? 'text/csv' : 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Cannot reach the server. Please check that it is running and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && session) { auth.clear(); onExpired(); }
  if (!res.ok || json.ok === false) { const e = new Error(json.error?.message || `The server returned an error (${res.status}).`); e.field = json.error?.field; e.status = res.status; throw e; }
  return json.data;
}

export const api = {
  roles: () => call('GET', '/api/auth/roles'),
  signIn: (b) => call('POST', '/api/auth/signin', b),
  meta: () => call('GET', '/api/meta'),
  overview: () => call('GET', '/api/overview'),
  issues: () => call('GET', '/api/issues'),
  actions: () => call('GET', '/api/actions'),
  decide: (code, action, reason) => call('PATCH', `/api/actions/${encodeURIComponent(code)}`, { action, reason }),
  patients: () => call('GET', '/api/patients'),
  preview: (b, signal) => call('POST', '/api/triage/preview', b, signal),
  addPatient: (b) => call('POST', '/api/patients', b),
  patientAction: (id, b) => call('PATCH', `/api/patients/${encodeURIComponent(id)}`, b),
  beds: () => call('GET', '/api/beds'),
  diagStaff: () => call('GET', '/api/diagnostics-staff'),
  complaints: () => call('GET', '/api/complaints'),
  data: () => call('GET', '/api/data'),
  uploadFile: (name, text) => call('PUT', `/api/data/files/${encodeURIComponent(name)}`, undefined, undefined, text),
  setSnapshot: (value) => call('PUT', '/api/data/snapshot-time', { value }),
  resetData: () => call('POST', '/api/data/reset', {}),
};

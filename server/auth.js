// Staff sign-in, as in the design: full name, work email, hospital staff ID and role.
// The user is saved in MongoDB and gets an HMAC-signed session. Name and role always come from the session,
// never from later request bodies, and every screen and approval is checked against the role on the server.
const crypto = require('crypto');
const M = require('./models');
const { ROLES, ROLE_NAMES } = require('./config');

const SECRET = process.env.AUTH_SECRET || (() => {
  console.warn(JSON.stringify({ level: 'warn', msg: 'AUTH_SECRET not set - using a random secret; sessions reset on restart' }));
  return crypto.randomBytes(32).toString('hex');
})();
const TOKEN_HOURS = 12;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const STAFF_RE = /^[A-Za-z]{2,5}-?\d{3,8}$/;

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
const issueToken = (u) => {
  const payload = Buffer.from(JSON.stringify({ email: u.email, name: u.name, role: u.role, staffId: u.staffId, exp: Date.now() + TOKEN_HOURS * 3600e3 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp > Date.now() && ROLES[d.role] ? d : null; } catch { return null; }
}
const fail = (res, status, message, field) => res.status(status).json({ ok: false, error: { message, code: status, field } });
const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role, staffId: u.staffId, permissions: ROLES[u.role] });

// Same checks and messages as the sign-in screen
function checkSignIn(b = {}) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const email = String(b.email || '').trim().toLowerCase();
  const staffId = String(b.staffId || '').trim().toUpperCase();
  const role = b.role;
  if (name.length < 2 || name.length > 60) return { error: 'Please enter your full name.', field: 'name' };
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: 'Please enter a valid work email.', field: 'email' };
  if (!STAFF_RE.test(staffId)) return { error: 'Staff ID should look like SMH-10234.', field: 'staffId' };
  if (!ROLE_NAMES.includes(role)) return { error: 'Please choose your role.', field: 'role' };
  return { value: { name, email, staffId, role } };
}

async function signIn(req, res) {
  const { error, field, value } = checkSignIn(req.body);
  if (error) return fail(res, 400, error, field);
  const now = new Date();
  await M.User.updateOne({ email: value.email }, { $set: { ...value, lastLoginAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
  await M.AuditLog.create({ by: value.name, role: value.role, text: 'signed in' });
  res.json({ ok: true, data: { token: issueToken(value), user: publicUser(value) } });
}

function requireAuth(req, res, next) {
  const user = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!user) return fail(res, 401, 'Your session has ended. Please sign in again.');
  req.user = user; req.perm = ROLES[user.role];
  next();
}
// Screen-level access: the role must have the tab
const needTab = (tab) => (req, res, next) => (req.perm.tabs.includes(tab) ? next() : fail(res, 403, 'This screen is not available for your role.'));

module.exports = { signIn, checkSignIn, requireAuth, needTab, publicUser };

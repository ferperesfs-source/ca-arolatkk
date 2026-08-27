const SUPABASE_URL = process.env.SUPABASE_URL || 'https://futysxjtptcsahgyrpci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_5ZHATfufgFDbhiJnFBp4ig_xaxf-1Oq';
const PRIMECASH_URL = 'https://api.primecashbrasil.com/v1';

export const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
};

const readResponse = async (response) => {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.error || data?.msg || `Falha HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
};

export const hasServerCredentials = () => Boolean(process.env.PRIMECASH_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = async (path, options = {}) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return readResponse(response);
};

export const requireAdmin = async (req) => {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id&limit=1`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: authorization }
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
};

export const primecashRequest = async (path, options = {}) => {
  const secret = process.env.PRIMECASH_SECRET_KEY;
  if (!secret) throw new Error('PRIMECASH_SECRET_KEY não configurada.');
  const basic = Buffer.from(`${secret}:x`, 'utf8').toString('base64');
  const response = await fetch(`${PRIMECASH_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return readResponse(response);
};

export const siteOrigin = (req) => {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${protocol}://${host}`;
};

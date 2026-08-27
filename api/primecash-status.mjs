import { hasServerCredentials, requireAdmin, sendJson } from './_primecash.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });
  if (!(await requireAdmin(req))) return sendJson(res, 401, { error: 'Sessão administrativa inválida.' });
  return sendJson(res, 200, { provider: 'primecash', configured: hasServerCredentials() });
}

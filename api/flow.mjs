const SUPABASE_URL = process.env.SUPABASE_URL || 'https://futysxjtptcsahgyrpci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_5ZHATfufgFDbhiJnFBp4ig_xaxf-1Oq';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const declaredSize = Number(request.headers['content-length'] || 0);
  if (declaredSize > 64 * 1024) return response.status(413).json({ error: 'Dados enviados são muito grandes.' });

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/primecash/checkout`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'Cacarola-Checkout/1.0'
      },
      body: JSON.stringify(request.body || {}),
      signal: AbortSignal.timeout(20000)
    });

    const payload = await upstream.text();
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return response.status(upstream.status).send(payload);
  } catch (error) {
    console.error('Checkout upstream unavailable', {
      name: error?.name || 'Error',
      message: String(error?.message || 'unknown').slice(0, 180)
    });
    return response.status(502).json({ error: 'Pagamento temporariamente indisponível. Tente novamente.' });
  }
}

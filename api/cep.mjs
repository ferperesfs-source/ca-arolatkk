export default async function handler(request, response) {
  const callback = typeof request.query?.callback === 'string' && /^[A-Za-z_$][\w$]{0,64}$/.test(request.query.callback)
    ? request.query.callback
    : '';
  const send = (status, payload) => {
    if (!callback) return response.status(status).json(payload);
    const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return response.status(200).send(`${callback}(${safePayload});`);
  };

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return send(405, { error: 'method_not_allowed' });
  }

  const postalCode = String(request.query?.cep || '').replace(/\D/g, '');
  if (postalCode.length !== 8) return send(400, { error: 'invalid_postal_code' });

  try {
    const lookup = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Cacarola-Checkout/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!lookup.ok) throw new Error(`ViaCEP respondeu ${lookup.status}`);

    const address = await lookup.json();
    if (address.erro) return send(404, { error: 'not_found' });

    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return send(200, {
      postalCode: address.cep,
      street: address.logradouro || '',
      neighborhood: address.bairro || '',
      city: address.localidade || '',
      state: address.uf || ''
    });
  } catch (error) {
    console.error('CEP lookup failed', { postalCode, message: error.message });
    return send(502, { error: 'lookup_unavailable' });
  }
}

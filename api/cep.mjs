export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const postalCode = String(request.query?.cep || '').replace(/\D/g, '');
  if (postalCode.length !== 8) return response.status(400).json({ error: 'CEP inválido.' });

  try {
    const lookup = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Cacarola-Checkout/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!lookup.ok) throw new Error(`ViaCEP respondeu ${lookup.status}`);

    const address = await lookup.json();
    if (address.erro) return response.status(404).json({ error: 'CEP não encontrado.' });

    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return response.status(200).json({
      postalCode: address.cep,
      street: address.logradouro || '',
      neighborhood: address.bairro || '',
      city: address.localidade || '',
      state: address.uf || ''
    });
  } catch (error) {
    console.error('CEP lookup failed', { postalCode, message: error.message });
    return response.status(502).json({ error: 'Não foi possível consultar o CEP agora.' });
  }
}

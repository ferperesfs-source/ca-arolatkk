import test from 'node:test';
import assert from 'node:assert/strict';
import checkoutHandler from '../api/primecash-checkout.mjs';
import webhookHandler from '../api/primecash-webhook.mjs';

const response = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(value) { this.body = JSON.parse(value); }
});

test('checkout bloqueia enquanto as credenciais não existem', async () => {
  const oldPrime = process.env.PRIMECASH_SECRET_KEY;
  const oldService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.PRIMECASH_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = response();
  await checkoutHandler({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 503);
  process.env.PRIMECASH_SECRET_KEY = oldPrime;
  process.env.SUPABASE_SERVICE_ROLE_KEY = oldService;
});

test('checkout calcula no servidor e devolve somente a URL segura', async () => {
  process.env.PRIMECASH_SECRET_KEY = 'secret_test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_test';
  let primePayload;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/gateway_settings')) return new Response(JSON.stringify([{ active: true }]), { status: 200 });
    if (String(url).includes('/orders?select=')) return new Response(JSON.stringify([{
      id: 42, amount: 87.9, items: [{ product_id: 'marmore', title: 'Kit 10 Peças Colinox', variant_name: 'Mármore', unit_price: 87.9, quantity: 1 }]
    }]), { status: 201 });
    if (String(url).endsWith('/v1/checkouts')) {
      primePayload = JSON.parse(options.body);
      assert.match(options.headers.Authorization, /^Basic /);
      return new Response(JSON.stringify({ id: 99, secureUrl: 'https://checkout.primecash.example/secure' }), { status: 200 });
    }
    if (String(url).includes('/orders?id=eq.42')) return new Response(null, { status: 204 });
    throw new Error(`URL inesperada: ${url}`);
  };
  const res = response();
  await checkoutHandler({
    method: 'POST',
    headers: { host: 'loja.example', 'x-forwarded-proto': 'https' },
    body: { customer: { name: 'Cliente Teste', email: 'cliente@example.com', phone: '11999999999', taxId: '12345678910' }, items: [{ productId: 'marmore', quantity: 1 }] }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.secureUrl, 'https://checkout.primecash.example/secure');
  assert.equal(primePayload.amount, 8790);
  assert.equal(primePayload.items[0].unitPrice, 8790);
  assert.equal(primePayload.settings.pix.enabled, true);
  assert.equal(primePayload.settings.card.enabled, true);
  assert.equal('secret' in res.body, false);
  global.fetch = originalFetch;
});

test('postback consulta a PrimeCash antes de marcar o pedido como pago', async () => {
  process.env.PRIMECASH_SECRET_KEY = 'secret_test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_test';
  const originalFetch = global.fetch;
  let savedUpdate;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/orders?payment_reference=')) return new Response(JSON.stringify([{ id: 42, gateway_checkout_id: '99' }]), { status: 200 });
    if (String(url).endsWith('/v1/checkouts/99')) return new Response(JSON.stringify({ transaction: { status: 'paid' } }), { status: 200 });
    if (String(url).includes('/orders?id=eq.42')) { savedUpdate = JSON.parse(options.body); return new Response(null, { status: 204 }); }
    throw new Error(`URL inesperada: ${url}`);
  };
  const res = response();
  await webhookHandler({ method: 'POST', query: { reference: '123e4567-e89b-12d3-a456-426614174000' }, body: { type: 'checkout', objectId: '99' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(savedUpdate.status, 'paid');
  assert.equal(savedUpdate.gateway_status, 'paid');
  global.fetch = originalFetch;
});

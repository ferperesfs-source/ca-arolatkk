import { randomUUID } from 'node:crypto';
import { hasServerCredentials, parseBody, primecashRequest, sendJson, siteOrigin, supabaseAdmin } from './_primecash.mjs';

const productId = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' });
  if (!hasServerCredentials()) return sendJson(res, 503, { error: 'O gateway ainda não foi configurado pelo administrador.' });

  let input;
  try { input = parseBody(req); }
  catch { return sendJson(res, 400, { error: 'Dados do checkout inválidos.' }); }

  const customer = input.customer || {};
  const name = String(customer.name || '').trim().slice(0, 120);
  const email = String(customer.email || '').trim().toLowerCase().slice(0, 180);
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(0, 20);
  const taxId = String(customer.taxId || '').replace(/\D/g, '').slice(0, 14);
  const items = Array.isArray(input.items) ? input.items.slice(0, 8).map((item) => ({
    product_id: productId(item.productId),
    quantity: Math.max(0, Math.min(99, Number.parseInt(item.quantity, 10) || 0))
  })) : [];

  if (name.split(/\s+/).length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 10 || ![11, 14].includes(taxId.length)) {
    return sendJson(res, 400, { error: 'Revise os dados de identificação.' });
  }
  if (!items.length || items.some((item) => !item.product_id || item.quantity < 1)) {
    return sendJson(res, 400, { error: 'O carrinho contém itens inválidos.' });
  }

  try {
    const settings = await supabaseAdmin('/rest/v1/gateway_settings?provider=eq.primecash&select=active&limit=1');
    if (!settings?.[0]?.active) return sendJson(res, 503, { error: 'O gateway de pagamento está desativado.' });

    const reference = randomUUID();
    const orders = await supabaseAdmin('/rest/v1/orders?select=id,payment_reference,amount,items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        customer_name: name,
        customer_email: email,
        phone,
        customer_tax_id: taxId,
        items,
        payment_reference: reference,
        gateway: 'primecash',
        gateway_status: 'creating'
      })
    });
    const order = orders?.[0];
    if (!order) throw new Error('Não foi possível registrar o pedido.');

    const postbackUrl = `${siteOrigin(req)}/api/primecash-webhook?reference=${encodeURIComponent(reference)}`;
    try {
      const checkout = await primecashRequest('/checkouts', {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(Number(order.amount) * 100),
          description: `Pedido Colinox #${order.id}`,
          postbackUrl,
          items: order.items.map((item) => ({
            title: `${item.title} - ${item.variant_name}`,
            unitPrice: Math.round(Number(item.unit_price) * 100),
            quantity: Number(item.quantity),
            tangible: true,
            externalRef: `${reference}:${item.product_id}`
          })),
          settings: {
            defaultPaymentMethod: 'pix',
            requestAddress: true,
            requestPhone: true,
            requestDocument: true,
            traceable: true,
            pix: { enabled: true, expiresInDays: 2 },
            boleto: { enabled: false, expiresInDays: 2 },
            card: { enabled: true, freeInstallments: 1, maxInstallments: 12 }
          },
          splits: []
        })
      });
      if (!checkout?.id || !checkout?.secureUrl) throw new Error('A PrimeCash não retornou uma URL de pagamento.');
      await supabaseAdmin(`/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ gateway_checkout_id: String(checkout.id), gateway_status: 'pending', updated_at: new Date().toISOString() })
      });
      return sendJson(res, 200, { orderId: order.id, secureUrl: checkout.secureUrl });
    } catch (error) {
      await supabaseAdmin(`/rest/v1/orders?id=eq.${order.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled', gateway_status: 'creation_failed', updated_at: new Date().toISOString() })
      }).catch(() => null);
      throw error;
    }
  } catch (error) {
    console.error('PrimeCash checkout error:', error.status || '', error.message);
    const unavailable = /não configurad|desativado/i.test(error.message);
    return sendJson(res, unavailable ? 503 : 502, { error: unavailable ? error.message : 'Não foi possível iniciar o pagamento. Tente novamente.' });
  }
}

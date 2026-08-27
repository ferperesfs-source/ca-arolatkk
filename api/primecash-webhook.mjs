import { parseBody, primecashRequest, sendJson, supabaseAdmin } from './_primecash.mjs';

const statusMap = {
  paid: 'paid', authorized: 'processing', processing: 'processing', pending: 'pending', waiting_payment: 'pending',
  refused: 'cancelled', cancelled: 'cancelled', refunded: 'cancelled', chargedback: 'cancelled'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' });
  const reference = String(req.query?.reference || '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reference)) return sendJson(res, 400, { error: 'Referência inválida.' });

  let payload;
  try { payload = parseBody(req); }
  catch { return sendJson(res, 400, { error: 'Payload inválido.' }); }

  try {
    const orders = await supabaseAdmin(`/rest/v1/orders?payment_reference=eq.${encodeURIComponent(reference)}&select=id,gateway_checkout_id&limit=1`);
    const order = orders?.[0];
    if (!order?.gateway_checkout_id) return sendJson(res, 404, { error: 'Pedido não encontrado.' });

    const eventCheckoutId = String(payload.type === 'checkout' ? (payload.objectId || payload.data?.id || '') : (payload.data?.checkoutId || ''));
    if (eventCheckoutId && eventCheckoutId !== String(order.gateway_checkout_id)) return sendJson(res, 409, { error: 'Checkout divergente.' });

    const verified = await primecashRequest(`/checkouts/${encodeURIComponent(order.gateway_checkout_id)}`);
    const gatewayStatus = String(verified?.transaction?.status || 'pending').toLowerCase();
    const status = statusMap[gatewayStatus] || 'pending';
    const address = verified?.transaction?.customer?.address;
    const update = { status, gateway_status: gatewayStatus, updated_at: new Date().toISOString() };
    if (address) {
      update.shipping_address = [address.street, address.streetNumber, address.complement, address.neighborhood].filter(Boolean).join(', ');
      update.city = [address.city, address.state].filter(Boolean).join(' - ');
      update.postal_code = address.zipCode || null;
    }
    await supabaseAdmin(`/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(update)
    });
    return sendJson(res, 200, { received: true });
  } catch (error) {
    console.error('PrimeCash webhook error:', error.status || '', error.message);
    return sendJson(res, 502, { error: 'Não foi possível validar o evento.' });
  }
}

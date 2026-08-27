import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PRIMECASH_URL = "https://api.primecashbrasil.com/v1";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/primecash`;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const parseJson = async (req: Request) => {
  try { return await req.json(); }
  catch { throw new Error("Dados enviados são inválidos."); }
};

const requireAdmin = async (req: Request) => {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Sessão administrativa inválida."), { status: 401 });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) throw Object.assign(new Error("Sessão administrativa inválida."), { status: 401 });
  const { data: membership } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!membership) throw Object.assign(new Error("Acesso administrativo não autorizado."), { status: 403 });
  return user;
};

const getSecret = async () => {
  const { data, error } = await supabase.rpc("get_primecash_secret");
  if (error) throw error;
  return typeof data === "string" && data.length ? data : null;
};

const hasSecret = async () => {
  const { data, error } = await supabase.rpc("has_primecash_secret");
  if (error) throw error;
  return Boolean(data);
};

const basicAuthorization = (secret: string) => `Basic ${btoa(`${secret}:x`)}`;

const primecashFetch = (path: string, secret: string, options: RequestInit = {}) => fetch(`${PRIMECASH_URL}${path}`, {
  ...options,
  headers: {
    Accept: "application/json",
    Authorization: basicAuthorization(secret),
    "Content-Type": "application/json",
    ...(options.headers || {}),
  },
});

const readPrimecash = async (response: Response) => {
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Falha HTTP ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
};

const primecashRequest = async (path: string, secret: string, options: RequestInit = {}) => readPrimecash(await primecashFetch(path, secret, options));

type SecretProbe = {
  accepted: boolean;
  status: number;
  reason: string;
};

const safeProviderReason = async (response: Response) => {
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const reason = String(data?.message || data?.error || "").replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/gi, "[credencial protegida]").trim();
  return reason.slice(0, 180);
};

const probeSecret = async (secret: string): Promise<SecretProbe> => {
  // A documentação oficial define GET /transactions como uma operação Basic
  // Auth sem parâmetros. Só uma resposta 2xx comprova que a chave funciona.
  const response = await primecashFetch("/transactions", secret, { method: "GET" });
  if (response.ok) return { accepted: true, status: response.status, reason: "" };
  const reason = await safeProviderReason(response);
  console.warn("PrimeCash credential probe rejected:", response.status, reason || "no provider detail");
  return { accepted: false, status: response.status, reason };
};

const productId = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80);

const statusMap: Record<string, string> = {
  paid: "paid", authorized: "processing", processing: "processing", pending: "pending", waiting_payment: "pending",
  refused: "cancelled", cancelled: "cancelled", canceled: "cancelled", refunded: "cancelled", chargedback: "cancelled",
};

const handleStatus = async (req: Request, url: URL) => {
  await requireAdmin(req);
  const { data: settings, error } = await supabase.from("gateway_settings").select("active").eq("provider", "primecash").maybeSingle();
  if (error) throw error;
  const configured = await hasSecret();
  let reachable = false;
  if (configured && url.searchParams.get("probe") === "1") {
    const secret = await getSecret();
    if (secret) reachable = (await probeSecret(secret)).accepted;
  }
  return json({ provider: "primecash", active: Boolean(settings?.active), configured, reachable });
};

const handleCredentials = async (req: Request) => {
  await requireAdmin(req);
  if (req.method !== "PUT") return json({ error: "Método não permitido." }, 405);
  const body = await parseJson(req) as { secretKey?: unknown };
  const secretKey = String(body.secretKey || "").trim();
  if (secretKey.length < 12 || secretKey.length > 500) return json({ error: "Informe uma Secret Key válida." }, 400);
  const probe = await probeSecret(secretKey);
  if (!probe.accepted) {
    const baseError = probe.status === 403
      ? "A credencial chegou à PrimeCash, mas não tem permissão para usar a API. Verifique se a conta e a API estão habilitadas."
      : probe.status === 401
        ? "A PrimeCash recusou a autenticação (HTTP 401). Use a Secret Key de Configurações → Credenciais de API, não a chave pública."
        : `A PrimeCash recusou a validação (HTTP ${probe.status}).`;
    const error = probe.reason && !baseError.toLowerCase().includes(probe.reason.toLowerCase())
      ? `${baseError} Retorno da API: ${probe.reason}`
      : baseError;
    return json({ error, providerStatus: probe.status }, 400);
  }
  const { error } = await supabase.rpc("set_primecash_secret", { p_secret: secretKey });
  if (error) throw error;
  return json({ provider: "primecash", configured: true, reachable: true });
};

const handleCheckout = async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const body = await parseJson(req) as any;
  const customer = body.customer || {};
  const shipping = body.shipping || {};
  const name = String(customer.name || "").trim().slice(0, 120);
  const email = String(customer.email || "").trim().toLowerCase().slice(0, 180);
  const phone = String(customer.phone || "").replace(/\D/g, "").slice(0, 20);
  const taxId = String(customer.taxId || "").replace(/\D/g, "").slice(0, 14);
  const postalCode = String(shipping.postalCode || "").replace(/\D/g, "").slice(0, 8);
  const street = String(shipping.street || "").trim().slice(0, 140);
  const streetNumber = String(shipping.number || "").trim().slice(0, 20);
  const complement = String(shipping.complement || "").trim().slice(0, 80);
  const neighborhood = String(shipping.neighborhood || "").trim().slice(0, 100);
  const city = String(shipping.city || "").trim().slice(0, 100);
  const state = String(shipping.state || "").trim().toUpperCase().slice(0, 2);
  const items = Array.isArray(body.items) ? body.items.slice(0, 8).map((item: any) => ({
    product_id: productId(item.productId),
    quantity: Math.max(0, Math.min(99, Number.parseInt(item.quantity, 10) || 0)),
  })) : [];
  if (name.split(/\s+/).length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 10 || ![11, 14].includes(taxId.length)) {
    return json({ error: "Revise os dados de identificação." }, 400);
  }
  if (postalCode.length !== 8 || !street || !streetNumber || !neighborhood || !city || state.length !== 2) {
    return json({ error: "Revise o endereço de entrega." }, 400);
  }
  if (!items.length || items.some((item: any) => !item.product_id || item.quantity < 1)) return json({ error: "O carrinho contém itens inválidos." }, 400);

  const { data: settings } = await supabase.from("gateway_settings").select("active").eq("provider", "primecash").maybeSingle();
  if (!settings?.active) return json({ error: "O gateway de pagamento está desativado." }, 503);
  const secret = await getSecret();
  if (!secret) return json({ error: "O gateway ainda não foi configurado pelo administrador." }, 503);

  const reference = crypto.randomUUID();
  const { data: order, error: orderError } = await supabase.from("orders").insert({
    customer_name: name, customer_email: email, phone, customer_tax_id: taxId, items,
    shipping_address: [street, streetNumber, complement, neighborhood].filter(Boolean).join(", "),
    city: `${city} - ${state}`, postal_code: postalCode,
    payment_reference: reference, gateway: "primecash", gateway_status: "creating",
  }).select("id,payment_reference,amount,items").single();
  if (orderError || !order) throw orderError || new Error("Não foi possível registrar o pedido.");

  try {
    const transaction = await primecashRequest("/transactions", secret, {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(Number(order.amount) * 100),
        paymentMethod: "pix",
        customer: {
          name, email, phone,
          document: { number: taxId, type: taxId.length === 14 ? "cnpj" : "cpf" },
          externalRef: reference,
        },
        shipping: {
          fee: 0,
          address: {
            street, streetNumber, complement: complement || undefined, zipCode: postalCode,
            neighborhood, city, state, country: "BR",
          },
        },
        postbackUrl: `${FUNCTION_URL}/webhook?reference=${encodeURIComponent(reference)}`,
        items: order.items.map((item: any) => ({
          title: `${item.title} - ${item.variant_name}`,
          unitPrice: Math.round(Number(item.unit_price) * 100),
          quantity: Number(item.quantity), tangible: true,
          externalRef: `${reference}:${item.product_id}`,
        })),
        pix: { expiresInDays: 2 },
        metadata: JSON.stringify({ orderId: order.id, reference }),
        traceable: true,
        splits: [],
      }),
    });
    const pixCode = String(transaction?.pix?.qrcode || "").trim();
    if (!transaction?.id || !pixCode) throw new Error("A PrimeCash não retornou o código Pix da transação.");
    const qrSvg = await QRCode.toString(pixCode, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 280 });
    const qrCodeImage = `data:image/svg+xml;base64,${btoa(qrSvg)}`;
    const { error: updateError } = await supabase.from("orders").update({
      gateway_checkout_id: String(transaction.id), gateway_status: String(transaction.status || "waiting_payment"), updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (updateError) throw updateError;
    return json({
      orderId: order.id,
      status: String(transaction.status || "waiting_payment"),
      pixCode,
      qrCodeImage,
      expiresAt: transaction.pix?.expirationDate || null,
    });
  } catch (error) {
    await supabase.from("orders").update({ status: "cancelled", gateway_status: "creation_failed", updated_at: new Date().toISOString() }).eq("id", order.id);
    throw error;
  }
};

const handleWebhook = async (req: Request, url: URL) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const reference = url.searchParams.get("reference") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reference)) return json({ error: "Referência inválida." }, 400);
  const payload = await parseJson(req) as any;
  const { data: order } = await supabase.from("orders").select("id,gateway_checkout_id").eq("payment_reference", reference).maybeSingle();
  if (!order?.gateway_checkout_id) return json({ error: "Pedido não encontrado." }, 404);
  const eventTransactionId = String(payload.type === "transaction" ? (payload.objectId || payload.data?.id || "") : (payload.data?.transaction?.id || ""));
  if (eventTransactionId && eventTransactionId !== String(order.gateway_checkout_id)) return json({ error: "Transação divergente." }, 409);
  const secret = await getSecret();
  if (!secret) throw new Error("Credencial PrimeCash indisponível.");
  const verified = await primecashRequest(`/transactions/${encodeURIComponent(order.gateway_checkout_id)}`, secret);
  const gatewayStatus = String(verified?.status || payload.data?.status || "pending").toLowerCase();
  const address = verified?.customer?.address || verified?.shipping?.address;
  const update: Record<string, unknown> = { status: statusMap[gatewayStatus] || "pending", gateway_status: gatewayStatus, updated_at: new Date().toISOString() };
  if (address) {
    update.shipping_address = [address.street, address.streetNumber, address.complement, address.neighborhood].filter(Boolean).join(", ");
    update.city = [address.city, address.state].filter(Boolean).join(" - ");
    update.postal_code = address.zipCode || null;
  }
  const { error } = await supabase.from("orders").update(update).eq("id", order.id);
  if (error) throw error;
  return json({ received: true });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).at(-1) || "";
  try {
    if (action === "status") return await handleStatus(req, url);
    if (action === "credentials") return await handleCredentials(req);
    if (action === "checkout") return await handleCheckout(req);
    if (action === "webhook") return await handleWebhook(req, url);
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha interna.";
    const status = Number((error as any)?.status) || (/não autorizad|sessão/i.test(message) ? 401 : 500);
    console.error("PrimeCash function error:", status, message);
    return json({ error: status < 500 ? message : "Não foi possível concluir a operação." }, status);
  }
});

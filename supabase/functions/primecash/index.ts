import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PRIMECASH_URL = "https://api.primecashbrasil.com/v1";
const TITANS_URL = "https://api.titansgateway.net";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/primecash`;
type Provider = "primecash" | "titans";
type MarketingProvider = "google" | "meta" | "tiktok";
type MarketingIntegration = { id: string; provider: MarketingProvider; name: string; tracking_id: string; active: boolean };
type PushcutEvent = "order_created" | "order_paid";
type PushcutEndpoint = { id: string; name: string; event_type: PushcutEvent; url_hint: string; active: boolean };
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
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

const providerSecret = async (provider: Provider) => {
  const { data, error } = await supabase.rpc(provider === "titans" ? "get_titans_secret" : "get_primecash_secret");
  if (error) throw error;
  return typeof data === "string" && data.length ? data : null;
};

const providerHasSecret = async (provider: Provider) => {
  const { data, error } = await supabase.rpc(provider === "titans" ? "has_titans_secret" : "has_primecash_secret");
  if (error) throw error;
  return Boolean(data);
};

const providerFromUrl = (url: URL): Provider => url.searchParams.get("provider") === "titans" ? "titans" : "primecash";

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
    Object.assign(error, { status: response.status, details: data?.error || data?.details || null });
    throw error;
  }
  return data;
};

const primecashRequest = async (path: string, secret: string, options: RequestInit = {}) => readPrimecash(await primecashFetch(path, secret, options));

const titansFetch = (path: string, secret: string, options: RequestInit = {}) => fetch(`${TITANS_URL}${path}`, {
  ...options,
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  },
});

const titansRequest = async (path: string, secret: string, options: RequestInit = {}) => readPrimecash(await titansFetch(path, secret, options));

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

const probeTitansSecret = async (secret: string): Promise<SecretProbe> => {
  const response = await titansFetch("/v1/store-info", secret, { method: "GET" });
  if (response.ok) return { accepted: true, status: response.status, reason: "" };
  const reason = await safeProviderReason(response);
  console.warn("Titans credential probe rejected:", response.status, reason || "no provider detail");
  return { accepted: false, status: response.status, reason };
};

const probeProviderSecret = (provider: Provider, secret: string) => provider === "titans" ? probeTitansSecret(secret) : probeSecret(secret);

const productId = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80);

const statusMap: Record<string, string> = {
  paid: "paid", authorized: "processing", processing: "processing", pending: "pending", waiting_payment: "pending",
  med: "processing", refused: "cancelled", cancelled: "cancelled", canceled: "cancelled", refunded: "cancelled", chargedback: "cancelled",
};

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const verifyTitansSignature = async (rawBody: string, signature: string) => {
  const { data: secret, error } = await supabase.rpc("get_titans_webhook_secret");
  if (error) throw error;
  if (!secret) return true;
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = btoa(String.fromCharCode(...digest));
  return timingSafeEqual(expected, signature.trim());
};

const marketingRules: Record<MarketingProvider, { id: RegExp; idLabel: string; secretLabel: string }> = {
  google: { id: /^G-[A-Z0-9]{5,20}$/i, idLabel: "ID de medição", secretLabel: "API Secret" },
  meta: { id: /^\d{5,30}$/, idLabel: "Pixel ID", secretLabel: "Access Token" },
  tiktok: { id: /^[A-Z0-9_-]{5,80}$/i, idLabel: "Pixel Code", secretLabel: "Access Token" },
};

const readMarketingIntegrations = async () => {
  const { data, error } = await supabase.from("marketing_integrations")
    .select("id,provider,name,tracking_id,active,created_at,updated_at").order("created_at", { ascending: true });
  if (error) throw error;
  const { data: deliveries, error: deliveryError } = await supabase.from("marketing_deliveries").select("integration_id,status");
  if (deliveryError) throw deliveryError;
  const stats = new Map<string, { delivered: number; failed: number }>();
  for (const row of deliveries || []) {
    const current = stats.get(row.integration_id) || { delivered: 0, failed: 0 };
    if (row.status === "delivered") current.delivered += 1;
    if (row.status === "failed") current.failed += 1;
    stats.set(row.integration_id, current);
  }
  return await Promise.all((data || []).map(async (integration) => {
    const { data: secret, error: secretError } = await supabase.rpc("get_marketing_secret", { p_integration_id: integration.id });
    if (secretError) throw secretError;
    return { ...integration, configured: Boolean(secret), deliveries: stats.get(integration.id) || { delivered: 0, failed: 0 } };
  }));
};

const handleTracking = async (req: Request, url: URL) => {
  await requireAdmin(req);
  if (req.method === "GET") return json({ integrations: await readMarketingIntegrations() });
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Integração inválida." }, 400);
    const { error: secretError } = await supabase.rpc("delete_marketing_secret", { p_integration_id: id });
    if (secretError) throw secretError;
    const { error } = await supabase.from("marketing_integrations").delete().eq("id", id);
    if (error) throw error;
    return json({ deleted: true });
  }
  if (!["POST", "PUT"].includes(req.method)) return json({ error: "Método não permitido." }, 405);
  const body = await parseJson(req) as Record<string, unknown>;
  const id = String(body.id || "");
  const provider = String(body.provider || "") as MarketingProvider;
  const name = String(body.name || "").trim().slice(0, 80);
  const trackingId = String(body.trackingId || "").trim().slice(0, 200);
  const secret = String(body.secret || "").trim();
  const active = body.active !== false;
  if (!marketingRules[provider]) return json({ error: "Selecione uma plataforma válida." }, 400);
  if (name.length < 2) return json({ error: "Informe um nome para identificar a integração." }, 400);
  if (!marketingRules[provider].id.test(trackingId)) return json({ error: `${marketingRules[provider].idLabel} inválido.` }, 400);
  if (secret && (secret.length < 8 || secret.length > 1000)) return json({ error: `${marketingRules[provider].secretLabel} inválido.` }, 400);
  if (req.method === "POST" && !secret) return json({ error: `Informe o ${marketingRules[provider].secretLabel}.` }, 400);
  const values = { provider, name, tracking_id: trackingId, active, updated_at: new Date().toISOString() };
  const query = req.method === "PUT"
    ? supabase.from("marketing_integrations").update(values).eq("id", id).select("id").single()
    : supabase.from("marketing_integrations").insert(values).select("id").single();
  const { data: integration, error } = await query;
  if (error || !integration) throw error || new Error("Não foi possível salvar a integração.");
  if (secret) {
    const { error: secretError } = await supabase.rpc("set_marketing_secret", { p_integration_id: integration.id, p_secret: secret });
    if (secretError) throw secretError;
  }
  return json({ saved: true, integrations: await readMarketingIntegrations() });
};

const sha256 = async (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const deterministicClientId = async (orderId: number) => {
  const digest = new DataView(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`order:${orderId}`)));
  return `${digest.getUint32(0) || 1}.${digest.getUint32(4) || 1}`;
};

const sha256Exact = async (value: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalizePushcutUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (raw.length < 30 || raw.length > 1000) throw Object.assign(new Error("Cole uma URL de notificação válida do PushCut."), { status: 400 });
  let url: URL;
  try { url = new URL(raw); }
  catch { throw Object.assign(new Error("A URL do PushCut está incompleta ou inválida."), { status: 400 }); }
  const segments = url.pathname.split("/").filter(Boolean);
  const valid = url.protocol === "https:" && url.hostname === "api.pushcut.io" && !url.port && !url.username && !url.password
    && !url.search && !url.hash && segments.length === 3 && segments[1] === "notifications"
    && segments[0].length >= 8 && segments[0].length <= 300 && segments[2].length >= 1 && segments[2].length <= 300;
  if (!valid) throw Object.assign(new Error("Use a URL oficial copiada do PushCut: api.pushcut.io/.../notifications/...."), { status: 400 });
  return url.toString();
};

const readPushcutEndpoints = async () => {
  const { data, error } = await supabase.from("pushcut_endpoints")
    .select("id,name,event_type,url_hint,active,created_at,updated_at").order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  const { data: deliveries, error: deliveryError } = await supabase.from("pushcut_deliveries")
    .select("endpoint_id,event_type,status").order("created_at", { ascending: false }).limit(10000);
  if (deliveryError) throw deliveryError;
  const stats = new Map<string, { delivered: number; failed: number; processing: number }>();
  for (const row of deliveries || []) {
    const current = stats.get(row.endpoint_id) || { delivered: 0, failed: 0, processing: 0 };
    if (row.status === "delivered") current.delivered += 1;
    if (row.status === "failed") current.failed += 1;
    if (row.status === "processing") current.processing += 1;
    stats.set(row.endpoint_id, current);
  }
  return await Promise.all((data || []).map(async (endpoint) => {
    const { data: secret, error: secretError } = await supabase.rpc("get_pushcut_url", { p_endpoint_id: endpoint.id });
    if (secretError) throw secretError;
    return { ...endpoint, configured: Boolean(secret), deliveries: stats.get(endpoint.id) || { delivered: 0, failed: 0, processing: 0 } };
  }));
};

const handlePushcut = async (req: Request, url: URL) => {
  await requireAdmin(req);
  if (req.method === "GET") return json({ endpoints: await readPushcutEndpoints() });
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Destino do PushCut inválido." }, 400);
    const { error } = await supabase.from("pushcut_endpoints").delete().eq("id", id);
    if (error) throw error;
    const { error: secretError } = await supabase.rpc("delete_pushcut_url", { p_endpoint_id: id });
    if (secretError) throw secretError;
    return json({ deleted: true });
  }
  if (!["POST", "PUT"].includes(req.method)) return json({ error: "Método não permitido." }, 405);
  const body = await parseJson(req) as Record<string, unknown>;
  const id = String(body.id || "");
  const name = String(body.name || "").trim().slice(0, 80);
  const eventType = String(body.eventType || "") as PushcutEvent;
  const active = body.active !== false;
  const suppliedUrl = String(body.url || "").trim();
  if (name.length < 2) return json({ error: "Informe um nome para identificar o destino." }, 400);
  if (!["order_created", "order_paid"].includes(eventType)) return json({ error: "Selecione quando a notificação será enviada." }, 400);
  if (req.method === "PUT" && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Destino do PushCut inválido." }, 400);
  if (req.method === "POST" && !suppliedUrl) return json({ error: "Cole a URL da notificação do PushCut." }, 400);
  const normalizedUrl = suppliedUrl ? normalizePushcutUrl(suppliedUrl) : "";
  const values: Record<string, unknown> = { name, event_type: eventType, active, updated_at: new Date().toISOString() };
  if (normalizedUrl) values.url_fingerprint = await sha256Exact(normalizedUrl);
  if (req.method === "POST") values.url_hint = "api.pushcut.io/••••••/notifications/••••••";
  const query = req.method === "PUT"
    ? supabase.from("pushcut_endpoints").update(values).eq("id", id).select("id").single()
    : supabase.from("pushcut_endpoints").insert(values).select("id").single();
  const { data: endpoint, error } = await query;
  if (error?.code === "23505") return json({ error: "Este link já está cadastrado para o mesmo evento." }, 409);
  if (error || !endpoint) throw error || new Error("Não foi possível salvar o destino.");
  if (normalizedUrl) {
    const { error: secretError } = await supabase.rpc("set_pushcut_url", { p_endpoint_id: endpoint.id, p_url: normalizedUrl });
    if (secretError) {
      if (req.method === "POST") await supabase.from("pushcut_endpoints").delete().eq("id", endpoint.id);
      throw secretError;
    }
  }
  return json({ saved: true, endpoints: await readPushcutEndpoints() });
};

const postPushcut = async (destination: string, payload: Record<string, unknown>) => {
  let lastError: unknown = new Error("O PushCut não respondeu.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(destination, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return response.status;
      const detail = (await response.text()).slice(0, 180);
      const retryable = response.status === 429 || response.status >= 500;
      lastError = Object.assign(new Error(detail || `HTTP ${response.status}`), { responseStatus: response.status });
      if (!retryable) throw lastError;
    } catch (error) {
      lastError = error;
      if (Number((error as any)?.responseStatus) > 0 && Number((error as any).responseStatus) < 500 && Number((error as any).responseStatus) !== 429) throw error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (2 ** attempt)));
  }
  throw lastError;
};

const dispatchPushcutEvent = async (orderId: number, eventType: PushcutEvent) => {
  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id,amount,currency,status,gateway_checkout_id,items,addons").eq("id", orderId).single();
  if (orderError || !order) return;
  if (eventType === "order_paid" && order.status !== "paid") return;
  if (eventType === "order_created" && (!order.gateway_checkout_id || order.status === "cancelled")) return;
  const { data: endpoints, error } = await supabase.from("pushcut_endpoints")
    .select("id,name,event_type,url_hint,active").eq("active", true).eq("event_type", eventType).limit(50);
  if (error) throw error;
  await Promise.allSettled((endpoints || []).map(async (endpoint: PushcutEndpoint) => {
    const { data: deliveryId, error: claimError } = await supabase.rpc("claim_pushcut_delivery", {
      p_order_id: order.id, p_endpoint_id: endpoint.id, p_event_type: eventType,
    });
    if (claimError) throw claimError;
    if (!deliveryId) return;
    try {
      const { data: destination, error: secretError } = await supabase.rpc("get_pushcut_url", { p_endpoint_id: endpoint.id });
      if (secretError || !destination) throw secretError || new Error("URL do PushCut não configurada.");
      const totalItems = [...(Array.isArray(order.items) ? order.items : []), ...(Array.isArray(order.addons) ? order.addons : [])]
        .reduce((sum: number, item: any) => sum + Number(item.quantity || 1), 0);
      const formattedAmount = Number(order.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: order.currency || "BRL" });
      const paid = eventType === "order_paid";
      const eventId = `pc_${paid ? "paid" : "created"}_${order.id}_${endpoint.id.slice(0, 8)}`;
      const responseStatus = await postPushcut(destination, {
          title: paid ? "Pagamento aprovado" : "Novo pedido gerado",
          text: `Pedido #CLX-${String(order.id).padStart(4, "0")} · ${formattedAmount} · ${totalItems} item${totalItems === 1 ? "" : "s"}${paid ? " · pagamento confirmado" : " · aguardando pagamento"}`,
          input: JSON.stringify({ orderId: order.id, event: eventType, amount: Number(order.amount || 0) }),
          id: eventId,
          threadId: "pedidos",
          isTimeSensitive: paid,
          sound: paid ? "jobDone" : "system",
      });
      await supabase.from("pushcut_deliveries").update({
        status: "delivered", response_status: responseStatus, last_error: null,
        delivered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);
    } catch (deliveryError) {
      const safeError = deliveryError instanceof Error ? deliveryError.message.slice(0, 240) : "Falha ao enviar notificação.";
      await supabase.from("pushcut_deliveries").update({
        status: "failed", response_status: Number((deliveryError as any)?.responseStatus) || null,
        last_error: safeError, updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);
      console.warn("PushCut delivery failed:", eventType, endpoint.id, safeError);
    }
  }));
};

const trackedItems = (items: any[]) => (Array.isArray(items) ? items : []).map((item) => ({
  id: String(item.product_id || item.addon_id || "produto"),
  name: String(item.title || "Kit 10 Peças Colinox"),
  variant: String(item.variant_name || ""),
  price: Number(item.unit_price || 0),
  quantity: Number(item.quantity || 1),
}));

const sendMarketingPurchase = async (integration: MarketingIntegration, secret: string, order: any) => {
  const items = trackedItems([...(Array.isArray(order.items) ? order.items : []), ...(Array.isArray(order.addons) ? order.addons : [])]);
  const value = Number(order.amount || 0);
  const eventId = `purchase_${order.id}`;
  const eventTime = Math.floor(Date.now() / 1000);
  const email = await sha256(order.customer_email);
  const phone = await sha256(String(order.phone || "").replace(/\D/g, ""));
  const externalId = await sha256(String(order.customer_tax_id || "").replace(/\D/g, ""));
  let endpoint = "";
  let options: RequestInit = {};
  if (integration.provider === "google") {
    endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(integration.tracking_id)}&api_secret=${encodeURIComponent(secret)}`;
    options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      client_id: await deterministicClientId(Number(order.id)), timestamp_micros: Date.now() * 1000,
      events: [{ name: "purchase", params: { transaction_id: String(order.id), currency: order.currency || "BRL", value, shipping: Number(order.shipping_amount || 0),
        items: items.map((item) => ({ item_id: item.id, item_name: item.name, item_variant: item.variant, price: item.price, quantity: item.quantity })) } }],
    }) };
  } else if (integration.provider === "meta") {
    endpoint = `https://graph.facebook.com/${encodeURIComponent(integration.tracking_id)}/events?access_token=${encodeURIComponent(secret)}`;
    options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: [{
      event_name: "Purchase", event_time: eventTime, event_id: eventId, action_source: "website",
      event_source_url: "https://ca-arolatkk.vercel.app/checkout",
      user_data: { ...(email && { em: [email] }), ...(phone && { ph: [phone] }), ...(externalId && { external_id: [externalId] }) },
      custom_data: { currency: order.currency || "BRL", value, order_id: String(order.id), content_type: "product",
        contents: items.map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.price })) },
    }] }) };
  } else {
    endpoint = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
    options = { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": secret }, body: JSON.stringify({
      event_source: "web", event_source_id: integration.tracking_id, data: [{ event: "Purchase", event_time: eventTime, event_id: eventId,
        user: { ...(email && { email: [email] }), ...(phone && { phone: [phone] }), ...(externalId && { external_id: [externalId] }) },
        properties: { currency: order.currency || "BRL", value, content_type: "product",
          contents: items.map((item) => ({ content_id: item.id, content_name: item.name, quantity: item.quantity, price: item.price })) },
        page: { url: "https://ca-arolatkk.vercel.app/checkout" },
      }],
    }) };
  }
  const response = await fetch(endpoint, { ...options, signal: AbortSignal.timeout(6000) });
  const responseText = await response.text();
  let responseData: any = null;
  try { responseData = responseText ? JSON.parse(responseText) : null; } catch { responseData = null; }
  const providerRejected = integration.provider === "tiktok" && responseData?.code != null && Number(responseData.code) !== 0;
  if (!response.ok || providerRejected || responseData?.error) {
    const reason = String(responseData?.error?.message || responseData?.message || `HTTP ${response.status}`).slice(0, 220);
    throw Object.assign(new Error(reason), { responseStatus: response.status });
  }
  return response.status;
};

const dispatchPaidOrder = async (orderId: number) => {
  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id,customer_email,phone,customer_tax_id,items,addons,shipping_amount,amount,currency,status").eq("id", orderId).single();
  if (orderError || !order || order.status !== "paid") return;
  const { data: integrations, error } = await supabase.from("marketing_integrations")
    .select("id,provider,name,tracking_id,active").eq("active", true).limit(30);
  if (error) throw error;
  await Promise.allSettled((integrations || []).map(async (integration: MarketingIntegration) => {
    const { data: deliveryId, error: claimError } = await supabase.rpc("claim_marketing_delivery", { p_order_id: order.id, p_integration_id: integration.id });
    if (claimError) throw claimError;
    if (!deliveryId) return;
    try {
      const { data: secret, error: secretError } = await supabase.rpc("get_marketing_secret", { p_integration_id: integration.id });
      if (secretError || !secret) throw secretError || new Error("Credencial não configurada.");
      const responseStatus = await sendMarketingPurchase(integration, secret, order);
      await supabase.from("marketing_deliveries").update({ status: "delivered", response_status: responseStatus, last_error: null, updated_at: new Date().toISOString() }).eq("id", deliveryId);
    } catch (deliveryError) {
      const safeError = deliveryError instanceof Error ? deliveryError.message.slice(0, 240) : "Falha ao enviar evento.";
      await supabase.from("marketing_deliveries").update({ status: "failed", response_status: Number((deliveryError as any)?.responseStatus) || null, last_error: safeError, updated_at: new Date().toISOString() }).eq("id", deliveryId);
      console.warn("Marketing delivery failed:", integration.provider, safeError);
    }
  }));
};

const handleStatus = async (req: Request, url: URL) => {
  await requireAdmin(req);
  const provider = providerFromUrl(url);
  const { data: settings, error } = await supabase.from("gateway_settings").select("active").eq("provider", provider).maybeSingle();
  if (error) throw error;
  const configured = await providerHasSecret(provider);
  let reachable = false;
  if (configured && url.searchParams.get("probe") === "1") {
    const secret = await providerSecret(provider);
    if (secret) reachable = (await probeProviderSecret(provider, secret)).accepted;
  }
  return json({ provider, active: Boolean(settings?.active), configured, reachable });
};

const handleCredentials = async (req: Request, url: URL) => {
  await requireAdmin(req);
  if (req.method !== "PUT") return json({ error: "Método não permitido." }, 405);
  const provider = providerFromUrl(url);
  const body = await parseJson(req) as { secretKey?: unknown; webhookSecret?: unknown };
  const secretKey = String(body.secretKey || "").trim();
  const webhookSecret = String(body.webhookSecret || "").trim();
  if (secretKey.length < 12 || secretKey.length > 500) return json({ error: `Informe uma ${provider === "titans" ? "API Key" : "Secret Key"} válida.` }, 400);
  if (webhookSecret && (webhookSecret.length < 12 || webhookSecret.length > 500)) return json({ error: "Informe um Webhook Secret válido." }, 400);
  const probe = await probeProviderSecret(provider, secretKey);
  if (!probe.accepted) {
    const gatewayName = provider === "titans" ? "Titans" : "PrimeCash";
    const baseError = probe.status === 403
      ? `A ${gatewayName} recusou a credencial (HTTP 403). Use a chave de pagamentos, não a chave de saque ou tokenização.`
      : probe.status === 401
        ? `A ${gatewayName} recusou a autenticação (HTTP 401). Confira a chave de pagamentos.`
        : `A ${gatewayName} recusou a validação (HTTP ${probe.status}).`;
    const error = probe.reason && !baseError.toLowerCase().includes(probe.reason.toLowerCase())
      ? `${baseError} Retorno da API: ${probe.reason}`
      : baseError;
    return json({ error, providerStatus: probe.status }, 400);
  }
  const { error } = await supabase.rpc(provider === "titans" ? "set_titans_secret" : "set_primecash_secret", { p_secret: secretKey });
  if (error) throw error;
  if (provider === "titans" && webhookSecret) {
    const { error: webhookError } = await supabase.rpc("set_titans_webhook_secret", { p_secret: webhookSecret });
    if (webhookError) throw webhookError;
  }
  return json({ provider, configured: true, reachable: true });
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
  const addons = Array.isArray(body.addons) ? body.addons.slice(0, 3).map((value: unknown) => productId(value)) : [];
  const shippingMethod = productId(body.shippingMethod || "free");
  if (name.split(/\s+/).length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 10 || ![11, 14].includes(taxId.length)) {
    return json({ error: "Revise os dados de identificação." }, 400);
  }
  if (postalCode.length !== 8 || !street || !streetNumber || !neighborhood || !city || state.length !== 2) {
    return json({ error: "Revise o endereço de entrega." }, 400);
  }
  if (!items.length || items.some((item: any) => !item.product_id || item.quantity < 1)) return json({ error: "O carrinho contém itens inválidos." }, 400);
  if (addons.some((id: string) => !id) || new Set(addons).size !== addons.length || !shippingMethod) return json({ error: "Revise as ofertas e a forma de entrega." }, 400);

  const { data: settings, error: settingsError } = await supabase.from("gateway_settings").select("provider,active").eq("active", true).maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings?.active || !["primecash", "titans"].includes(settings.provider)) return json({ error: "O gateway de pagamento está desativado." }, 503);
  const provider = settings.provider as Provider;
  const secret = await providerSecret(provider);
  if (!secret) return json({ error: "O gateway ainda não foi configurado pelo administrador." }, 503);

  const reference = crypto.randomUUID();
  const { data: order, error: orderError } = await supabase.from("orders").insert({
    customer_name: name, customer_email: email, phone, customer_tax_id: taxId, items,
    addons: addons.map((addonId: string) => ({ addon_id: addonId })), shipping_method: shippingMethod,
    shipping_address: [street, streetNumber, complement, neighborhood].filter(Boolean).join(", "),
    city: `${city} - ${state}`, postal_code: postalCode,
    payment_reference: reference, gateway: provider, gateway_status: "creating",
  }).select("id,payment_reference,amount,items,addons,shipping_amount,shipping_method").single();
  if (orderError || !order) throw orderError || new Error("Não foi possível registrar o pedido.");

  try {
    const amount = Math.round(Number(order.amount) * 100);
    const paymentItems = [...(order.items || []), ...(order.addons || [])];
    const shippingFee = Math.round(Number(order.shipping_amount || 0) * 100);
    const transaction = provider === "titans"
      ? await titansRequest("/v1/payment", secret, {
          method: "POST",
          body: JSON.stringify({
            amount,
            currency: "BRL",
            method: "PIX",
            description: `Pedido ${order.id} - Kit 10 Peças Colinox`,
            externalRef: reference,
            notificationUrl: `${FUNCTION_URL}/webhook?provider=titans&reference=${encodeURIComponent(reference)}`,
            payer: { name, taxId, email, phone },
            items: paymentItems.map((item: any) => ({
              quantity: Number(item.quantity),
              name: item.variant_name ? `${item.title} - ${item.variant_name}` : item.title,
              price: Math.round(Number(item.unit_price) * 100),
              type: "PHYSICAL",
            })),
            delivery: {
              fee: shippingFee,
              address: {
                country: "BR", state, city, district: neighborhood, street, number: streetNumber,
                complement: complement || null, zipCode: postalCode,
              },
            },
          }),
        })
      : await primecashRequest("/transactions", secret, {
          method: "POST",
          body: JSON.stringify({
            amount,
            paymentMethod: "pix",
            customer: {
              name, email, phone,
              document: { number: taxId, type: taxId.length === 14 ? "cnpj" : "cpf" },
              externalRef: reference,
            },
            shipping: {
              fee: shippingFee,
              address: {
                street, streetNumber, complement: complement || undefined, zipCode: postalCode,
                neighborhood, city, state, country: "BR",
              },
            },
            postbackUrl: `${FUNCTION_URL}/webhook?provider=primecash&reference=${encodeURIComponent(reference)}`,
            items: paymentItems.map((item: any) => ({
              title: item.variant_name ? `${item.title} - ${item.variant_name}` : item.title,
              unitPrice: Math.round(Number(item.unit_price) * 100),
              quantity: Number(item.quantity), tangible: true,
              externalRef: `${reference}:${item.product_id || item.addon_id}`,
            })),
            pix: { expiresInDays: 2 },
            metadata: JSON.stringify({ orderId: order.id, reference }),
            traceable: true,
            splits: [],
          }),
        });
    const pixCode = String((provider === "titans" ? transaction?.data?.copypaste : transaction?.pix?.qrcode) || "").trim();
    if (!transaction?.id || !pixCode) throw new Error("O provedor não retornou o código Pix da transação.");
    const qrSvg = await QRCode.toString(pixCode, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 280 });
    const qrCodeImage = `data:image/svg+xml;base64,${btoa(qrSvg)}`;
    const { error: updateError } = await supabase.from("orders").update({
      gateway_checkout_id: String(transaction.id), gateway_status: String(transaction.status || "pending").toLowerCase(), updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (updateError) throw updateError;
    EdgeRuntime.waitUntil(dispatchPushcutEvent(Number(order.id), "order_created").catch((notificationError) => {
      console.warn("PushCut order-created dispatch failed:", notificationError instanceof Error ? notificationError.message : notificationError);
    }));
    return json({
      orderId: order.id,
      status: String(transaction.status || "pending").toLowerCase(),
      pixCode,
      qrCodeImage,
      expiresAt: provider === "primecash" ? transaction.pix?.expirationDate || null : null,
      amount: Number(order.amount),
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
  const rawBody = await req.text();
  let payload: any = null;
  try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { return json({ error: "Dados enviados são inválidos." }, 400); }
  const { data: order } = await supabase.from("orders").select("id,gateway,gateway_checkout_id").eq("payment_reference", reference).maybeSingle();
  if (!order?.gateway_checkout_id) return json({ error: "Pedido não encontrado." }, 404);
  let verified: any = payload;
  if (order.gateway === "titans") {
    const signature = req.headers.get("X-Signature") || "";
    // Webhooks enviados para uma notificationUrl dinâmica não recebem assinatura
    // segundo a documentação da Titans. Quando ela vier, ainda assim validamos.
    if (signature && !await verifyTitansSignature(rawBody, signature)) return json({ error: "Assinatura inválida." }, 401);
    if (String(payload?.id || "") !== String(order.gateway_checkout_id) || String(payload?.externalRef || "") !== reference) {
      return json({ error: "Transação divergente." }, 409);
    }
  } else {
    const eventTransactionId = String(payload?.type === "transaction" ? (payload.objectId || payload.data?.id || "") : (payload?.data?.transaction?.id || ""));
    if (eventTransactionId && eventTransactionId !== String(order.gateway_checkout_id)) return json({ error: "Transação divergente." }, 409);
    const secret = await providerSecret("primecash");
    if (!secret) throw new Error("Credencial de pagamento indisponível.");
    verified = await primecashRequest(`/transactions/${encodeURIComponent(order.gateway_checkout_id)}`, secret);
  }
  const gatewayStatus = String(verified?.status || payload?.data?.status || "pending").toLowerCase();
  const address = order.gateway === "titans"
    ? verified?.delivery?.address
    : verified?.customer?.address || verified?.shipping?.address;
  const update: Record<string, unknown> = { status: statusMap[gatewayStatus] || "pending", gateway_status: gatewayStatus, updated_at: new Date().toISOString() };
  if (address) {
    update.shipping_address = [address.street, address.streetNumber || address.number, address.complement, address.neighborhood || address.district].filter(Boolean).join(", ");
    update.city = [address.city, address.state].filter(Boolean).join(" - ");
    update.postal_code = address.zipCode || null;
  }
  const { error } = await supabase.from("orders").update(update).eq("id", order.id);
  if (error) throw error;
  if (update.status === "paid") EdgeRuntime.waitUntil(Promise.allSettled([
    dispatchPaidOrder(Number(order.id)), dispatchPushcutEvent(Number(order.id), "order_paid"),
  ]));
  return json({ received: true });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).at(-1) || "";
  try {
    if (action === "status") return await handleStatus(req, url);
    if (action === "credentials") return await handleCredentials(req, url);
    if (action === "tracking") return await handleTracking(req, url);
    if (action === "pushcut") return await handlePushcut(req, url);
    if (action === "checkout") return await handleCheckout(req);
    if (action === "webhook") return await handleWebhook(req, url);
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha interna.";
    const status = Number((error as any)?.status) || (/não autorizad|sessão/i.test(message) ? 401 : 500);
    const detailKeys = (error as any)?.details && typeof (error as any).details === "object"
      ? Object.keys((error as any).details).slice(0, 12)
      : [];
    console.error("Payment function error:", status, message, detailKeys.length ? { invalidFields: detailKeys } : "");
    return json({ error: status < 500 ? message : "Não foi possível concluir a operação." }, status);
  }
});

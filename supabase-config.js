(() => {
  const url = 'https://futysxjtptcsahgyrpci.supabase.co';
  const publishableKey = 'sb_publishable_5ZHATfufgFDbhiJnFBp4ig_xaxf-1Oq';
  const isLocalPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const primecashFunctionUrl = isLocalPreview
    ? `${url}/functions/v1/primecash`
    : '/api/order-session';
  const sessionKey = 'cacarolaAdminSession';

  const request = async (path, options = {}, accessToken = '') => {
    const response = await fetch(`${url}${path}`, {
      ...options,
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || 'Não foi possível concluir a operação.');
    return data;
  };

  const getSession = () => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  };

  const saveSession = (session) => {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  };

  const refreshSession = async (session = getSession()) => {
    if (!session?.refresh_token) return null;
    const fresh = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    fresh.expires_at = Math.floor(Date.now() / 1000) + fresh.expires_in;
    saveSession(fresh);
    return fresh;
  };

  const validSession = async () => {
    let session = getSession();
    if (!session) return null;
    if (!session.expires_at || session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      try { session = await refreshSession(session); }
      catch { saveSession(null); return null; }
    }
    return session;
  };

  const sessionId = (() => {
    const key = 'cacarolaTrackingSession';
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem(key, value);
    }
    return value;
  })();

  const track = (eventName, properties = {}) => request('/rest/v1/tracking_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      session_id: sessionId,
      event_name: eventName,
      page_url: `${location.pathname}${location.search}`.slice(0, 500),
      properties
    })
  }).catch(() => null);

  const primecashRequest = async (path, options = {}, accessToken = '') => {
    let response;
    try {
      response = await fetch(`${primecashFunctionUrl}${path}`, {
        ...options,
        headers: {
          apikey: publishableKey,
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(options.headers || {})
        }
      });
    } catch {
      throw new Error('Não foi possível conectar ao pagamento. Verifique sua internet e tente novamente.');
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
    return data;
  };

  window.CacarolaSupabase = { url, publishableKey, request, primecashRequest, getSession, saveSession, validSession, track };
})();

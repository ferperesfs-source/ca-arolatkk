(() => {
  const api = window.CacarolaSupabase;
  const page = document.body.dataset.page;
  if (!api || !page) return;

  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateTime = (value) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (page === 'login') {
    const form = document.querySelector('#login-form');
    const email = document.querySelector('#login-email');
    const password = document.querySelector('#login-password');
    const submit = form?.querySelector('[type="submit"]');
    const alert = document.querySelector('#login-alert');
    const toggle = document.querySelector('.password-toggle');
    const setError = (input, message) => {
      const field = input.closest('.field');
      const error = field?.querySelector(`[data-error-for="${input.id}"]`);
      field?.classList.toggle('has-error', Boolean(message));
      input.setAttribute('aria-invalid', String(Boolean(message)));
      if (error) error.textContent = message;
    };
    const clearAlert = () => { alert.hidden = true; alert.textContent = ''; };

    api.validSession().then((session) => { if (session) location.replace('admin.html'); });
    [email, password].forEach((input) => input?.addEventListener('input', () => { setError(input, ''); clearAlert(); }));
    toggle?.addEventListener('click', () => {
      const visible = password.type === 'text';
      password.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', String(!visible));
      toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailValue = email.value.trim().toLowerCase();
      let valid = true;
      if (!/^\S+@\S+\.\S+$/.test(emailValue)) { setError(email, 'Informe um e-mail válido.'); valid = false; }
      if (!password.value) { setError(password, 'Informe sua senha.'); valid = false; }
      if (!valid) return form.querySelector('[aria-invalid="true"]')?.focus();
      submit.disabled = true;
      submit.querySelector('span').textContent = 'Entrando...';
      clearAlert();
      try {
        const session = await api.request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: emailValue, password: password.value }) });
        session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
        const membership = await api.request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`, {}, session.access_token);
        if (!membership?.length) throw new Error('Este usuário não possui acesso administrativo.');
        api.saveSession(session);
        location.assign('admin.html');
      } catch (error) {
        api.saveSession(null);
        alert.textContent = error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message;
        alert.hidden = false;
        password.focus();
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Entrar no painel';
      }
    });
    return;
  }

  if (page !== 'admin') return;
  const toast = document.querySelector('.toast');
  let toastTimer;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
  };
  const statusInfo = {
    paid: ['Pago', 'paid'], fulfilled: ['Enviado', 'paid'], processing: ['Processando', 'processing'],
    pending: ['Aguardando', 'waiting'], cancelled: ['Cancelado', 'waiting']
  };

  let cachedOrders = [];
  let cachedCustomers = [];
  let selectedGateway = 'primecash';
  let gatewaySettings = {};
  let gatewayHealth = {};
  let trackingIntegrations = [];
  const gatewayCatalog = {
    primecash: {
      name: 'PrimeCash Brasil', shortName: 'PrimeCash', logo: 'assets/gateways/primecash-logo.png',
      auth: 'Basic Auth com chave protegida', keyLabel: 'Secret Key', placeholder: 'Cole a Secret Key da PrimeCash',
      help: 'Use a Secret Key de Configurações → Credenciais de API.', docs: 'https://primecashbrasil.readme.io/reference/introducao',
      description: 'Os dados do pedido são validados no servidor e enviados para gerar o QR Code Pix diretamente no checkout.'
    },
    titans: {
      name: 'Titans Gateway', shortName: 'Titans', logo: 'assets/gateways/titans-logo.avif',
      auth: 'Bearer Token com API Key protegida', keyLabel: 'API Key', placeholder: 'Cole a chave de pagamentos da Titans',
      help: 'Use a chave de pagamentos em Financeiro → Integrações. Não use a chave de saque ou tokenização.', docs: 'https://app.titansgateway.net/docs/introduction/start',
      description: 'Pagamentos Pix criados pela API oficial, com código copia e cola exibido diretamente no checkout e status atualizado por webhook.'
    }
  };

  const routeConfig = {
    '#visao-geral': { view: 'overview', title: 'Visão geral', search: 'Buscar pedido, cliente...' },
    '#pedidos': { view: 'orders', title: 'Pedidos', search: 'Buscar pedido ou cliente...' },
    '#produtos': { view: 'products', title: 'Produtos', search: 'Buscar produto...' },
    '#clientes': { view: 'customers', title: 'Clientes', search: 'Buscar cliente...' },
    '#gateways': { view: 'gateways', title: 'Gateways', search: 'Gateways de pagamento' },
    '#rastreamento': { view: 'tracking', title: 'Rastreamento', search: 'Integrações de marketing' }
  };

  const currentRoute = () => routeConfig[location.hash] || routeConfig['#visao-geral'];
  const showRoute = ({ focus = false } = {}) => {
    const route = currentRoute();
    document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== route.view; });
    document.querySelectorAll('[data-route]').forEach((item) => {
      const active = item.dataset.route === route.view;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    document.querySelector('.topbar-title h1').textContent = route.title;
    const globalSearch = document.querySelector('.global-search input');
    if (globalSearch) globalSearch.placeholder = route.search;
    document.title = `${route.title} | Colinox Admin`;
    closeMenu();
    if (focus) document.querySelector('#admin-main')?.focus({ preventScroll: true });
  };

  const renderOrders = (orders) => {
    const body = document.querySelector('#orders-body');
    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum pedido real registrado ainda.</td></tr>';
      document.querySelector('.orders-panel .table-footer span').textContent = 'Nenhum pedido registrado';
      return;
    }
    body.innerHTML = orders.map((order) => {
      const initials = order.customer_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      const product = (order.items || []).map((item) => `${item.variant_name || item.title} ×${item.quantity}`).join(', ');
      const [label, className] = statusInfo[order.status] || [order.status, 'waiting'];
      return `<tr data-status="${escapeHtml(label)}"><td><strong>#CLX-${String(order.id).padStart(4, '0')}</strong></td><td><span class="customer"><i>${escapeHtml(initials)}</i><span>${escapeHtml(order.customer_name)}<small>${escapeHtml(order.customer_email)}</small></span></span></td><td>${escapeHtml(product)}</td><td><strong>${money(order.amount)}</strong></td><td><span class="status ${className}">${escapeHtml(label)}</span></td><td>${dateTime(order.created_at)}</td></tr>`;
    }).join('');
    document.querySelector('.orders-panel .table-footer span').textContent = `Exibindo ${orders.length} pedido${orders.length === 1 ? '' : 's'}`;
    const confirmedRevenue = orders.filter((order) => ['paid', 'fulfilled'].includes(order.status)).reduce((sum, order) => sum + Number(order.amount || 0), 0);
    document.querySelector('[data-orders-total]').textContent = String(orders.length);
    document.querySelector('[data-orders-pending]').textContent = String(orders.filter((order) => order.status === 'pending').length);
    document.querySelector('[data-orders-revenue]').textContent = money(confirmedRevenue);
  };

  const renderProducts = (products) => {
    const productImages = {
      marmore: 'cart-marmore.png',
      quartzo: 'assets/products/quartzo.webp',
      grafite: 'assets/products/grafite.webp',
      oliva: 'assets/products/oliva.webp'
    };
    const totalKnown = products.reduce((sum, product) => sum + (product.stock_quantity ?? 0), 0);
    document.querySelector('[data-product-count]').textContent = `${products.length} variações ativas`;
    document.querySelector('[data-stock-total]').textContent = products.every((product) => product.stock_quantity == null) ? 'Não informado' : `${totalKnown} un.`;
    document.querySelector('[data-products-total]').textContent = String(products.length);
    const grid = document.querySelector('[data-product-grid]');
    grid.innerHTML = products.length ? products.map((product) => {
      const quantity = product.stock_quantity;
      const stockClass = quantity == null ? 'unknown' : quantity < 10 ? 'low' : '';
      const stockLabel = quantity == null ? 'Não informado' : quantity < 10 ? 'Estoque baixo' : 'Disponível';
      return `<article class="product-card" data-search="${escapeHtml(`${product.title} ${product.variant_name}`.toLocaleLowerCase('pt-BR'))}"><img src="${escapeHtml(product.image_url || productImages[product.id] || 'cart-marmore.png')}" alt="${escapeHtml(`${product.title} ${product.variant_name}`)}" loading="lazy"><div class="product-card-header"><span><h3>${escapeHtml(product.variant_name)}</h3><small>${escapeHtml(product.title)}</small></span><strong>${money(product.price)}</strong></div><div class="stock-row"><span>Estoque <b>${quantity == null ? '—' : quantity}</b></span><span class="stock-pill ${stockClass}">${stockLabel}</span></div></article>`;
    }).join('') : '<p class="empty-state">Nenhum produto ativo cadastrado.</p>';
    const knownLow = products.filter((product) => product.stock_quantity != null && product.stock_quantity < 10);
    document.querySelector('[data-low-stock-total]').textContent = String(knownLow.length);
    const alert = document.querySelector('.stock-alert');
    alert.hidden = !knownLow.length;
    if (knownLow.length) alert.querySelector('span').innerHTML = `<strong>Estoque baixo</strong>${escapeHtml(knownLow.map((product) => product.variant_name).join(', '))}`;
  };

  const buildCustomers = (orders) => {
    const customers = new Map();
    orders.forEach((order) => {
      const email = String(order.customer_email || '').trim().toLocaleLowerCase('pt-BR');
      const key = email || `pedido-${order.id}`;
      const existing = customers.get(key) || { name: order.customer_name || 'Cliente', email, orders: 0, spent: 0, lastOrder: order.created_at };
      existing.orders += 1;
      if (['paid', 'fulfilled'].includes(order.status)) existing.spent += Number(order.amount || 0);
      if (new Date(order.created_at) > new Date(existing.lastOrder)) existing.lastOrder = order.created_at;
      customers.set(key, existing);
    });
    return [...customers.values()].sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));
  };

  const renderCustomers = (orders) => {
    cachedCustomers = buildCustomers(orders);
    const body = document.querySelector('#customers-body');
    body.innerHTML = cachedCustomers.length ? cachedCustomers.map((customer) => {
      const initials = customer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      return `<tr data-search="${escapeHtml(`${customer.name} ${customer.email}`.toLocaleLowerCase('pt-BR'))}"><td><span class="customer"><i>${escapeHtml(initials)}</i><span>${escapeHtml(customer.name)}<small>${escapeHtml(customer.email || 'E-mail não informado')}</small></span></span></td><td><strong>${customer.orders}</strong></td><td><strong>${money(customer.spent)}</strong></td><td>${dateTime(customer.lastOrder)}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="table-empty">Nenhum cliente registrado ainda.</td></tr>';
    const paidOrders = orders.filter((order) => ['paid', 'fulfilled'].includes(order.status));
    const paidRevenue = paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    document.querySelector('[data-customer-total]').textContent = String(cachedCustomers.length);
    document.querySelector('[data-repeat-customers]').textContent = String(cachedCustomers.filter((customer) => customer.orders > 1).length);
    document.querySelector('[data-average-ticket]').textContent = money(paidOrders.length ? paidRevenue / paidOrders.length : 0);
    document.querySelector('[data-customers-footer]').textContent = `${cachedCustomers.length} cliente${cachedCustomers.length === 1 ? '' : 's'} na base`;
  };

  const renderActivity = (orders) => {
    const list = document.querySelector('[data-activity-list]');
    if (!orders.length) return list.innerHTML = '<p class="empty-state">Nenhuma atividade registrada ainda.</p>';
    list.innerHTML = orders.slice(0, 4).map((order) => {
      const [label] = statusInfo[order.status] || [order.status];
      return `<div class="activity-item"><i>${escapeHtml(order.customer_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase())}</i><span><strong>${escapeHtml(order.customer_name)}</strong><small>#CLX-${String(order.id).padStart(4, '0')} · ${escapeHtml(label)}</small></span><b>${money(order.amount)}</b></div>`;
    }).join('');
  };

  const renderMetrics = (orders, events) => {
    const today = startOfDay();
    const todayOrders = orders.filter((order) => new Date(order.created_at) >= today);
    const revenueToday = todayOrders.filter((order) => ['paid','fulfilled'].includes(order.status)).reduce((sum, order) => sum + Number(order.amount), 0);
    const customersToday = new Set(todayOrders.map((order) => order.customer_email)).size;
    const visitorsToday = new Set(events.filter((event) => new Date(event.created_at) >= today && event.event_name === 'product_view').map((event) => event.session_id)).size;
    const conversion = visitorsToday ? (todayOrders.length / visitorsToday) * 100 : 0;
    const values = document.querySelectorAll('[data-metric-value]');
    values[0].textContent = money(revenueToday);
    values[1].textContent = String(todayOrders.length);
    values[2].textContent = String(customersToday);
    values[3].textContent = `${conversion.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    document.querySelector('[data-pending-count]').textContent = `${todayOrders.filter((order) => order.status === 'pending').length} aguardando pagamento`;
    document.querySelector('[data-visits-count]').textContent = `${visitorsToday} visita${visitorsToday === 1 ? '' : 's'} hoje`;
    const dayValues = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today); day.setDate(day.getDate() - (6 - index));
      const next = new Date(day); next.setDate(next.getDate() + 1);
      return orders.filter((order) => ['paid','fulfilled'].includes(order.status) && new Date(order.created_at) >= day && new Date(order.created_at) < next).reduce((sum, order) => sum + Number(order.amount), 0);
    });
    const max = Math.max(...dayValues, 1);
    document.querySelector('.bar-chart').innerHTML = dayValues.map((value, index) => {
      const day = new Date(today); day.setDate(day.getDate() - (6 - index));
      const label = index === 6 ? 'Hoje' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).replace('.', '');
      return `<div class="${index === 6 ? 'is-current' : ''}" style="--bar:${Math.max(value ? 8 : 2, (value / max) * 88)}%"><span>${money(value)}</span><i></i><small>${label}</small></div>`;
    }).join('');
    document.querySelector('[data-week-revenue]').textContent = money(dayValues.reduce((sum, value) => sum + value, 0));
    document.querySelector('[data-order-badge]').textContent = String(orders.filter((order) => order.status === 'pending').length);
  };

  const filterOrders = () => {
    const query = document.querySelector('#order-search').value.trim().toLocaleLowerCase('pt-BR');
    const status = document.querySelector('#status-filter').value.toLocaleLowerCase('pt-BR');
    let visible = 0;
    document.querySelectorAll('#orders-body tr').forEach((row) => {
      const matches = (!query || row.textContent.toLocaleLowerCase('pt-BR').includes(query)) && (!status || row.dataset.status?.toLocaleLowerCase('pt-BR').includes(status));
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    document.querySelector('.orders-panel .table-footer span').textContent = visible ? `Exibindo ${visible} pedido${visible === 1 ? '' : 's'}` : 'Nenhum pedido encontrado';
  };

  const filterProducts = () => {
    const query = document.querySelector('#product-search').value.trim().toLocaleLowerCase('pt-BR');
    document.querySelectorAll('.product-card').forEach((card) => { card.hidden = Boolean(query && !card.dataset.search.includes(query)); });
  };

  const filterCustomers = () => {
    const query = document.querySelector('#customer-search').value.trim().toLocaleLowerCase('pt-BR');
    let visible = 0;
    document.querySelectorAll('#customers-body tr[data-search]').forEach((row) => {
      const matches = !query || row.dataset.search.includes(query);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    document.querySelector('[data-customers-footer]').textContent = visible ? `Exibindo ${visible} cliente${visible === 1 ? '' : 's'}` : 'Nenhum cliente encontrado';
  };

  const exportCustomers = () => {
    if (!cachedCustomers.length) return showToast('Ainda não há clientes para exportar.');
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = ['Nome,E-mail,Pedidos,Total gasto,Última compra', ...cachedCustomers.map((customer) => [customer.name, customer.email, customer.orders, customer.spent.toFixed(2), new Date(customer.lastOrder).toISOString()].map(quote).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `clientes-colinox-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Relatório de clientes exportado.');
  };

  const renderGateway = () => {
    const provider = selectedGateway;
    const meta = gatewayCatalog[provider];
    const settings = gatewaySettings[provider] || {};
    const health = gatewayHealth[provider] || {};
    const active = Boolean(settings.active);
    const configured = Boolean(health.configured);
    const state = document.querySelector('[data-gateway-state]');
    const toggle = document.querySelector('[data-gateway-toggle]');
    const notice = document.querySelector('[data-gateway-notice]');
    const healthy = active && configured;
    document.querySelector('[data-gateway-logo]').src = meta.logo;
    document.querySelector('[data-gateway-logo]').alt = meta.shortName;
    document.querySelector('[data-gateway-title]').textContent = meta.name;
    document.querySelector('[data-gateway-description]').textContent = meta.description;
    document.querySelector('[data-gateway-name]').textContent = meta.shortName;
    document.querySelector('[data-gateway-auth]').textContent = meta.auth;
    document.querySelector('[data-gateway-key-label]').textContent = meta.keyLabel;
    document.querySelector('[data-gateway-key-help]').textContent = meta.help;
    document.querySelector('#gateway-secret-key').placeholder = meta.placeholder;
    document.querySelector('[data-gateway-docs]').href = meta.docs;
    document.querySelector('[data-titans-webhook-field]').hidden = provider !== 'titans';
    if (toggle) { toggle.checked = active; toggle.disabled = false; }
    if (state) {
      state.className = `gateway-state ${healthy ? 'is-active' : active ? 'is-error' : 'is-inactive'}`;
      state.innerHTML = `<i></i> ${healthy ? 'Ativo' : active ? 'Requer configuração' : 'Inativo'}`;
    }
    document.querySelector('[data-gateway-health]').textContent = healthy ? 'Operacional' : active ? 'Configuração pendente' : 'Desativado';
    document.querySelector('[data-gateway-credentials]').textContent = configured ? 'Protegida no Supabase Vault' : 'Não configuradas';
    notice.className = `gateway-notice ${healthy ? 'is-success' : active ? 'is-error' : ''}`;
    notice.textContent = healthy
      ? `${meta.shortName} está ativa. O checkout já pode criar pagamentos reais.`
      : active
        ? `Cadastre a ${meta.keyLabel} abaixo para liberar o checkout.`
        : 'Ative este gateway para usá-lo nas novas compras.';
    document.querySelectorAll('[data-gateway-provider]').forEach((button) => {
      const key = button.dataset.gatewayProvider;
      const keySettings = gatewaySettings[key] || {};
      const keyHealth = gatewayHealth[key] || {};
      const selected = key === provider;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-active', Boolean(keySettings.active && keyHealth.configured));
      button.classList.toggle('is-error', Boolean(keySettings.active && !keyHealth.configured));
      button.setAttribute('aria-selected', String(selected));
      const label = document.querySelector(`[data-provider-state="${key}"]`);
      if (label) label.textContent = keySettings.active ? (keyHealth.configured ? 'Ativo no checkout' : 'Requer configuração') : (keyHealth.configured ? 'Configurado' : 'Não configurado');
    });
  };

  const loadGatewayHealth = async (session, provider) => {
    try {
      return await api.primecashRequest(`/status?provider=${encodeURIComponent(provider)}`, {}, session.access_token);
    } catch { return { configured: false }; }
  };

  const trackingCatalog = {
    google: { name: 'Google Analytics', mark: 'G', idLabel: 'ID de medição', idPlaceholder: 'G-XXXXXXXXXX', idHelp: 'Admin → Fluxos de dados → Web → ID de medição.', secretLabel: 'API Secret' },
    meta: { name: 'Meta Pixel', mark: 'M', idLabel: 'Pixel ID', idPlaceholder: '123456789012345', idHelp: 'Gerenciador de Eventos → Fonte de dados → Identificação.', secretLabel: 'Access Token da API de Conversões' },
    tiktok: { name: 'TikTok Pixel', mark: 'T', idLabel: 'Pixel Code', idPlaceholder: 'CXXXXXXXXXXXXXXXXX', idHelp: 'Events Manager → Web Events → Pixel → Settings.', secretLabel: 'Access Token da Events API' }
  };

  const loadTracking = async (session) => {
    const response = await api.primecashRequest('/tracking', {}, session.access_token);
    trackingIntegrations = response.integrations || [];
    renderTracking();
  };

  const renderTracking = () => {
    const list = document.querySelector('[data-tracking-list]');
    if (!list) return;
    const delivered = trackingIntegrations.reduce((sum, item) => sum + Number(item.deliveries?.delivered || 0), 0);
    const failed = trackingIntegrations.reduce((sum, item) => sum + Number(item.deliveries?.failed || 0), 0);
    document.querySelector('[data-tracking-active]').textContent = String(trackingIntegrations.filter((item) => item.active && item.configured).length);
    document.querySelector('[data-tracking-delivered]').textContent = String(delivered);
    document.querySelector('[data-tracking-failed]').textContent = String(failed);
    list.innerHTML = trackingIntegrations.length ? trackingIntegrations.map((item) => {
      const meta = trackingCatalog[item.provider] || trackingCatalog.google;
      const active = Boolean(item.active && item.configured);
      const deliveryCopy = `${item.deliveries?.delivered || 0} enviada${item.deliveries?.delivered === 1 ? '' : 's'}${item.deliveries?.failed ? ` · ${item.deliveries.failed} com falha` : ''}`;
      return `<article class="tracking-item" data-tracking-id="${escapeHtml(item.id)}"><span class="tracking-provider-mark ${escapeHtml(item.provider)}" aria-hidden="true">${meta.mark}</span><div class="tracking-item-main"><span class="tracking-item-title"><strong>${escapeHtml(item.name)}</strong><i class="${active ? '' : 'is-inactive'}">${active ? 'Ativa' : item.configured ? 'Pausada' : 'Sem credencial'}</i></span><code>${escapeHtml(item.tracking_id)}</code><small>${escapeHtml(meta.name)} · ${escapeHtml(deliveryCopy)}</small></div><div class="tracking-item-actions"><button type="button" data-tracking-toggle>${item.active ? 'Pausar' : 'Ativar'}</button><button class="tracking-delete" type="button" data-tracking-delete aria-label="Remover ${escapeHtml(item.name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"></path></svg></button></div></article>`;
    }).join('') : '<p class="empty-state">Nenhuma integração cadastrada. Adicione seu primeiro destino ao lado.</p>';
  };

  const updateTrackingFields = () => {
    const form = document.querySelector('[data-tracking-form]');
    if (!form) return;
    const meta = trackingCatalog[form.elements.provider.value];
    document.querySelector('[data-tracking-id-label]').textContent = meta.idLabel;
    document.querySelector('[data-tracking-id-help]').textContent = meta.idHelp;
    document.querySelector('[data-tracking-secret-label]').textContent = meta.secretLabel;
    form.elements.trackingId.placeholder = meta.idPlaceholder;
    form.elements.secret.placeholder = `Cole o ${meta.secretLabel}`;
    if (!form.elements.name.value.trim()) form.elements.name.placeholder = `Ex.: ${meta.name} principal`;
  };

  const boot = async () => {
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    try {
      const membership = await api.request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=display_name,email`, {}, session.access_token);
      if (!membership?.length) throw new Error('Acesso administrativo não autorizado.');
      const [orders, products, events, gatewayRows, primecashHealth, titansHealth, trackingResponse] = await Promise.all([
        api.request('/rest/v1/orders?select=id,customer_name,customer_email,items,quantity,amount,status,created_at&order=created_at.desc&limit=500', {}, session.access_token),
        api.request('/rest/v1/products?select=id,title,variant_name,price,image_url,stock_quantity,active&active=eq.true&order=sort_order.asc', {}, session.access_token),
        api.request('/rest/v1/tracking_events?select=session_id,event_name,created_at&order=created_at.desc&limit=5000', {}, session.access_token),
        api.request('/rest/v1/gateway_settings?select=provider,active,updated_at&order=provider.asc', {}, session.access_token),
        loadGatewayHealth(session, 'primecash'),
        loadGatewayHealth(session, 'titans'),
        api.primecashRequest('/tracking', {}, session.access_token).catch(() => ({ integrations: [] }))
      ]);
      const displayName = membership[0].display_name || 'Administrador';
      document.querySelector('.admin-user strong').textContent = displayName;
      document.querySelector('.admin-user .user-avatar').textContent = displayName.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase();
      document.querySelector('.admin-user small').textContent = membership[0].email || 'Administrador';
      document.querySelector('#overview-heading').textContent = `Olá, ${displayName.split(' ')[0]}`;
      document.querySelector('[data-view="overview"] .eyebrow').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()).toLocaleUpperCase('pt-BR');
      cachedOrders = orders;
      renderOrders(orders); renderProducts(products); renderCustomers(orders); renderActivity(orders); renderMetrics(orders, events);
      gatewaySettings = Object.fromEntries(gatewayRows.map((row) => [row.provider, row]));
      gatewayHealth = { primecash: primecashHealth, titans: titansHealth };
      selectedGateway = gatewayRows.find((row) => row.active)?.provider || 'primecash';
      renderGateway();
      trackingIntegrations = trackingResponse.integrations || [];
      renderTracking();
    } catch (error) {
      showToast(error.message);
      if (error.message.includes('autorizado')) { api.saveSession(null); setTimeout(() => location.replace('login.html'), 1200); }
    }
  };

  const menuButton = document.querySelector('[data-menu]');
  const closeMenu = () => { document.body.classList.remove('menu-open'); menuButton?.setAttribute('aria-expanded', 'false'); };
  menuButton?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); menuButton.setAttribute('aria-expanded', String(open)); });
  document.querySelector('[data-close-menu]')?.addEventListener('click', closeMenu);
  document.querySelectorAll('[data-route]').forEach((item) => item.addEventListener('click', () => {
    if (location.hash === item.hash) showRoute({ focus: true });
  }));
  addEventListener('hashchange', () => showRoute({ focus: true }));
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    const session = api.getSession();
    if (session?.access_token) await api.request('/auth/v1/logout', { method: 'POST' }, session.access_token).catch(() => null);
    api.saveSession(null); location.replace('login.html');
  });
  document.querySelector('#order-search')?.addEventListener('input', filterOrders);
  document.querySelector('#status-filter')?.addEventListener('change', filterOrders);
  document.querySelector('#product-search')?.addEventListener('input', filterProducts);
  document.querySelector('#customer-search')?.addEventListener('input', filterCustomers);
  document.querySelector('[data-export-customers]')?.addEventListener('click', exportCustomers);
  document.querySelectorAll('[data-gateway-provider]').forEach((button) => button.addEventListener('click', () => {
    selectedGateway = button.dataset.gatewayProvider;
    const form = document.querySelector('[data-gateway-key-form]');
    form?.reset();
    document.querySelector('#gateway-key-error').textContent = '';
    document.querySelectorAll('.gateway-key-input').forEach((field) => field.classList.remove('has-error'));
    renderGateway();
  }));
  document.querySelector('[data-gateway-toggle]')?.addEventListener('change', async (event) => {
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    const active = event.target.checked;
    event.target.disabled = true;
    try {
      await api.request('/rest/v1/rpc/set_active_gateway', {
        method: 'POST',
        body: JSON.stringify({ p_provider: selectedGateway, p_active: active })
      }, session.access_token);
      Object.values(gatewaySettings).forEach((settings) => { settings.active = false; });
      gatewaySettings[selectedGateway] = { ...(gatewaySettings[selectedGateway] || {}), active };
      gatewayHealth[selectedGateway] = await loadGatewayHealth(session, selectedGateway);
      renderGateway();
      showToast(active ? `${gatewayCatalog[selectedGateway].shortName} definido como gateway do checkout.` : `${gatewayCatalog[selectedGateway].shortName} desativado no checkout.`);
    } catch (error) {
      event.target.checked = !active;
      event.target.disabled = false;
      showToast(error.message);
    }
  });
  document.querySelector('[data-test-gateway]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    button.disabled = true;
    button.textContent = 'Testando...';
    const health = await api.primecashRequest(`/status?provider=${encodeURIComponent(selectedGateway)}&probe=1`, {}, session.access_token).catch(() => ({ configured: false, reachable: false }));
    gatewayHealth[selectedGateway] = health;
    renderGateway();
    const meta = gatewayCatalog[selectedGateway];
    showToast(health.reachable ? `Conexão com a ${meta.shortName} confirmada.` : health.configured ? 'Chave salva, mas a conexão não respondeu.' : `Cadastre a ${meta.keyLabel}.`);
    button.disabled = false;
    button.textContent = 'Testar conexão';
  });
  document.querySelector('[data-toggle-gateway-key]')?.addEventListener('click', (event) => {
    const input = document.querySelector('#gateway-secret-key');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    event.currentTarget.setAttribute('aria-pressed', String(!visible));
    event.currentTarget.setAttribute('aria-label', visible ? 'Mostrar chave' : 'Ocultar chave');
  });
  document.querySelector('[data-gateway-key-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.secretKey;
    const submit = form.querySelector('[type="submit"]');
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    const error = document.querySelector('#gateway-key-error');
    const inputWrap = input.closest('.gateway-key-input');
    const secretKey = input.value.trim();
    const webhookSecret = form.elements.webhookSecret?.value.trim() || '';
    error.textContent = '';
    inputWrap.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    if (secretKey.length < 12) {
      error.textContent = 'Cole uma Secret Key válida com pelo menos 12 caracteres.';
      inputWrap.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      return input.focus();
    }
    submit.disabled = true;
    submit.querySelector('span').textContent = 'Validando e salvando...';
    try {
      const health = await api.primecashRequest(`/credentials?provider=${encodeURIComponent(selectedGateway)}`, { method: 'PUT', body: JSON.stringify({ secretKey, webhookSecret }) }, session.access_token);
      input.value = '';
      input.type = 'password';
      if (form.elements.webhookSecret) form.elements.webhookSecret.value = '';
      gatewayHealth[selectedGateway] = health;
      renderGateway();
      showToast(`${gatewayCatalog[selectedGateway].keyLabel} salva com criptografia no Supabase Vault.`);
    } catch (saveError) {
      error.textContent = saveError.message;
      inputWrap.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    } finally {
      submit.disabled = false;
      submit.querySelector('span').textContent = 'Salvar chave';
    }
  });
  document.querySelector('[data-tracking-provider]')?.addEventListener('change', updateTrackingFields);
  document.querySelector('[data-tracking-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const error = document.querySelector('[data-tracking-form-error]');
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    error.textContent = '';
    form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
    const payload = {
      provider: form.elements.provider.value,
      name: form.elements.name.value.trim(),
      trackingId: form.elements.trackingId.value.trim(),
      secret: form.elements.secret.value.trim(),
      active: form.elements.active.checked
    };
    const missing = ['name', 'trackingId', 'secret'].find((field) => !payload[field]);
    if (missing) {
      const input = form.elements[missing];
      input.setAttribute('aria-invalid', 'true');
      error.textContent = 'Preencha todos os campos obrigatórios.';
      return input.focus();
    }
    submit.disabled = true;
    submit.querySelector('span').textContent = 'Salvando com segurança...';
    try {
      const response = await api.primecashRequest('/tracking', { method: 'POST', body: JSON.stringify(payload) }, session.access_token);
      trackingIntegrations = response.integrations || [];
      renderTracking();
      form.reset();
      form.elements.active.checked = true;
      updateTrackingFields();
      showToast('Integração adicionada. Somente pedidos pagos serão enviados.');
    } catch (saveError) {
      error.textContent = saveError.message;
    } finally {
      submit.disabled = false;
      submit.querySelector('span').textContent = 'Adicionar integração';
    }
  });
  document.querySelector('[data-tracking-list]')?.addEventListener('click', async (event) => {
    const card = event.target.closest('[data-tracking-id]');
    const integration = trackingIntegrations.find((item) => item.id === card?.dataset.trackingId);
    if (!integration) return;
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-tracking-delete]')) {
      if (!confirm(`Remover a integração “${integration.name}”? Os pedidos futuros deixarão de ser enviados para ela.`)) return;
      button.disabled = true;
      try {
        await api.primecashRequest(`/tracking?id=${encodeURIComponent(integration.id)}`, { method: 'DELETE' }, session.access_token);
        trackingIntegrations = trackingIntegrations.filter((item) => item.id !== integration.id);
        renderTracking();
        showToast('Integração removida.');
      } catch (deleteError) { button.disabled = false; showToast(deleteError.message); }
      return;
    }
    if (button.matches('[data-tracking-toggle]')) {
      button.disabled = true;
      try {
        const response = await api.primecashRequest('/tracking', { method: 'PUT', body: JSON.stringify({
          id: integration.id, provider: integration.provider, name: integration.name,
          trackingId: integration.tracking_id, active: !integration.active
        }) }, session.access_token);
        trackingIntegrations = response.integrations || [];
        renderTracking();
        showToast(integration.active ? 'Integração pausada.' : 'Integração ativada.');
      } catch (toggleError) { button.disabled = false; showToast(toggleError.message); }
    }
  });
  document.querySelector('.global-search input')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const route = currentRoute().view;
    const targets = { orders: '#order-search', products: '#product-search', customers: '#customer-search' };
    const targetRoute = route === 'overview' ? 'orders' : route;
    if (route === 'overview') location.hash = '#pedidos';
    const target = document.querySelector(targets[targetRoute]);
    if (!target) return;
    target.value = event.target.value;
    ({ orders: filterOrders, products: filterProducts, customers: filterCustomers }[targetRoute])();
    target.focus();
  });
  document.querySelector('.notification-button')?.addEventListener('click', () => showToast('Os indicadores estão sincronizados com o Supabase.'));
  document.querySelector('[data-more-orders]')?.addEventListener('click', () => { renderOrders(cachedOrders); filterOrders(); showToast('Lista de pedidos atualizada.'); });
  if (!location.hash || !routeConfig[location.hash]) history.replaceState(null, '', '#visao-geral');
  showRoute();
  updateTrackingFields();
  boot();
})();

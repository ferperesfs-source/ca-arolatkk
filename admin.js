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

  const renderOrders = (orders) => {
    const body = document.querySelector('#orders-body');
    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px">Nenhum pedido real registrado ainda.</td></tr>';
      document.querySelector('.table-footer span').textContent = 'Nenhum pedido registrado';
      return;
    }
    body.innerHTML = orders.map((order) => {
      const initials = order.customer_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      const product = (order.items || []).map((item) => `${item.variant_name || item.title} ×${item.quantity}`).join(', ');
      const [label, className] = statusInfo[order.status] || [order.status, 'waiting'];
      return `<tr data-status="${escapeHtml(label)}"><td><strong>#CLX-${String(order.id).padStart(4, '0')}</strong></td><td><span class="customer"><i>${escapeHtml(initials)}</i><span>${escapeHtml(order.customer_name)}<small>${escapeHtml(order.customer_email)}</small></span></span></td><td>${escapeHtml(product)}</td><td><strong>${money(order.amount)}</strong></td><td><span class="status ${className}">${escapeHtml(label)}</span></td><td>${dateTime(order.created_at)}</td></tr>`;
    }).join('');
    document.querySelector('.table-footer span').textContent = `Exibindo ${orders.length} pedido${orders.length === 1 ? '' : 's'}`;
  };

  const renderProducts = (products) => {
    const totalKnown = products.reduce((sum, product) => sum + (product.stock_quantity ?? 0), 0);
    document.querySelector('[data-product-count]').textContent = `${products.length} variações ativas`;
    document.querySelector('[data-stock-total]').textContent = products.every((product) => product.stock_quantity == null) ? 'Não informado' : `${totalKnown} un.`;
    document.querySelector('.stock-list').innerHTML = products.map((product, index) => {
      const quantity = product.stock_quantity;
      return `<div><span><i class="${['marble','quartz','graphite','olive'][index] || 'marble'}"></i>${escapeHtml(product.variant_name)} <b>${quantity == null ? '—' : quantity}</b></span><progress max="100" value="${quantity == null ? 0 : Math.min(quantity, 100)}"></progress></div>`;
    }).join('');
    const knownLow = products.filter((product) => product.stock_quantity != null && product.stock_quantity < 10);
    const alert = document.querySelector('.stock-alert');
    alert.hidden = !knownLow.length;
    if (knownLow.length) alert.querySelector('span').innerHTML = `<strong>Estoque baixo</strong>${escapeHtml(knownLow.map((product) => product.variant_name).join(', '))}`;
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
    document.querySelector('[data-customer-total]').textContent = `${new Set(orders.map((order) => order.customer_email)).size} compradores`;
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
    document.querySelector('.table-footer span').textContent = visible ? `Exibindo ${visible} pedido${visible === 1 ? '' : 's'}` : 'Nenhum pedido encontrado';
  };

  const boot = async () => {
    const session = await api.validSession();
    if (!session) return location.replace('login.html');
    try {
      const membership = await api.request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=display_name,email`, {}, session.access_token);
      if (!membership?.length) throw new Error('Acesso administrativo não autorizado.');
      const [orders, products, events] = await Promise.all([
        api.request('/rest/v1/orders?select=id,customer_name,customer_email,items,quantity,amount,status,created_at&order=created_at.desc&limit=500', {}, session.access_token),
        api.request('/rest/v1/products?select=id,title,variant_name,price,image_url,stock_quantity,active&active=eq.true&order=sort_order.asc', {}, session.access_token),
        api.request('/rest/v1/tracking_events?select=session_id,event_name,created_at&order=created_at.desc&limit=5000', {}, session.access_token)
      ]);
      const displayName = membership[0].display_name || 'Administrador';
      document.querySelector('.admin-user strong').textContent = displayName;
      document.querySelector('.admin-user .user-avatar').textContent = displayName.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase();
      document.querySelector('.welcome-row h2').textContent = `Olá, ${displayName.split(' ')[0]}`;
      document.querySelector('.eyebrow').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()).toLocaleUpperCase('pt-BR');
      renderOrders(orders); renderProducts(products); renderMetrics(orders, events);
    } catch (error) {
      showToast(error.message);
      if (error.message.includes('autorizado')) { api.saveSession(null); setTimeout(() => location.replace('login.html'), 1200); }
    }
  };

  const menuButton = document.querySelector('[data-menu]');
  const closeMenu = () => { document.body.classList.remove('menu-open'); menuButton?.setAttribute('aria-expanded', 'false'); };
  menuButton?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); menuButton.setAttribute('aria-expanded', String(open)); });
  document.querySelector('[data-close-menu]')?.addEventListener('click', closeMenu);
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => item.addEventListener('click', closeMenu));
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    const session = api.getSession();
    if (session?.access_token) await api.request('/auth/v1/logout', { method: 'POST' }, session.access_token).catch(() => null);
    api.saveSession(null); location.replace('login.html');
  });
  document.querySelector('#order-search')?.addEventListener('input', filterOrders);
  document.querySelector('#status-filter')?.addEventListener('change', filterOrders);
  document.querySelector('.global-search input')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    document.querySelector('#order-search').value = event.target.value; filterOrders(); document.querySelector('#pedidos')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelector('.notification-button')?.addEventListener('click', () => showToast('Os indicadores estão sincronizados com o Supabase.'));
  document.querySelector('[data-more-orders]')?.addEventListener('click', () => showToast('Todos os pedidos carregados estão visíveis.'));
  document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast('Exportação será habilitada quando houver pedidos.')));
  boot();
})();

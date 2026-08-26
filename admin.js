(() => {
  const page = document.body.dataset.page;
  const authKey = 'colinoxAdminAuth';
  const demoEmail = 'admin@colinox.com.br';
  const demoPassword = 'admin123';

  if (page === 'login') {
    if (sessionStorage.getItem(authKey) === '1') {
      location.replace('admin.html');
      return;
    }

    const form = document.querySelector('#login-form');
    const email = document.querySelector('#login-email');
    const password = document.querySelector('#login-password');
    const submit = form?.querySelector('[type="submit"]');
    const alert = document.querySelector('#login-alert');
    const toggle = document.querySelector('.password-toggle');
    const demoFill = document.querySelector('[data-demo-fill]');

    const setError = (input, message) => {
      const field = input.closest('.field');
      const error = field?.querySelector(`[data-error-for="${input.id}"]`);
      field?.classList.toggle('has-error', Boolean(message));
      input.setAttribute('aria-invalid', String(Boolean(message)));
      if (error) error.textContent = message;
    };

    const clearAlert = () => {
      alert.hidden = true;
      alert.textContent = '';
    };

    [email, password].forEach((input) => input?.addEventListener('input', () => {
      setError(input, '');
      clearAlert();
    }));

    demoFill?.addEventListener('click', () => {
      email.value = demoEmail;
      password.value = demoPassword;
      setError(email, '');
      setError(password, '');
      clearAlert();
      password.focus();
    });

    toggle?.addEventListener('click', () => {
      const visible = password.type === 'text';
      password.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', String(!visible));
      toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
    });

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailValue = email.value.trim().toLowerCase();
      const passwordValue = password.value;
      let valid = true;

      if (!emailValue || !/^\S+@\S+\.\S+$/.test(emailValue)) {
        setError(email, 'Informe um e-mail válido.');
        valid = false;
      }
      if (!passwordValue) {
        setError(password, 'Informe sua senha.');
        valid = false;
      }
      if (!valid) {
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }

      if (emailValue !== demoEmail || passwordValue !== demoPassword) {
        alert.textContent = 'E-mail ou senha incorretos. Use o acesso demonstrativo abaixo.';
        alert.hidden = false;
        password.focus();
        return;
      }

      submit.disabled = true;
      submit.querySelector('span').textContent = 'Entrando...';
      window.setTimeout(() => {
        sessionStorage.setItem(authKey, '1');
        location.assign('admin.html');
      }, 450);
    });
    return;
  }

  if (page !== 'admin') return;
  if (sessionStorage.getItem(authKey) !== '1') {
    location.replace('login.html');
    return;
  }

  const toast = document.querySelector('.toast');
  let toastTimer;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  };

  const menuButton = document.querySelector('[data-menu]');
  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  };
  menuButton?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.querySelector('[data-close-menu]')?.addEventListener('click', closeMenu);

  const navItems = [...document.querySelectorAll('.sidebar-nav .nav-item')];
  navItems.forEach((item) => item.addEventListener('click', () => {
    navItems.forEach((link) => {
      link.classList.toggle('is-active', link === item);
      if (link === item) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    closeMenu();
  }));

  document.querySelector('[data-logout]')?.addEventListener('click', () => {
    sessionStorage.removeItem(authKey);
    location.replace('login.html');
  });

  const orderSearch = document.querySelector('#order-search');
  const statusFilter = document.querySelector('#status-filter');
  const rows = () => [...document.querySelectorAll('#orders-body tr')];
  const filterOrders = () => {
    const query = orderSearch.value.trim().toLocaleLowerCase('pt-BR');
    const status = statusFilter.value.toLocaleLowerCase('pt-BR');
    let visible = 0;
    rows().forEach((row) => {
      const matchesQuery = !query || row.textContent.toLocaleLowerCase('pt-BR').includes(query);
      const matchesStatus = !status || row.textContent.toLocaleLowerCase('pt-BR').includes(status);
      row.hidden = !(matchesQuery && matchesStatus);
      if (!row.hidden) visible += 1;
    });
    document.querySelector('.table-footer span').textContent = visible
      ? `Exibindo ${visible} pedido${visible === 1 ? '' : 's'}`
      : 'Nenhum pedido encontrado';
  };
  orderSearch?.addEventListener('input', filterOrders);
  statusFilter?.addEventListener('change', filterOrders);

  const globalSearch = document.querySelector('.global-search input');
  globalSearch?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    orderSearch.value = globalSearch.value;
    filterOrders();
    document.querySelector('#pedidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    orderSearch.focus();
  });

  document.querySelector('.notification-button')?.addEventListener('click', () => {
    showToast('3 notificações: 2 novos pedidos e 1 alerta de estoque.');
  });

  document.querySelector('[data-more-orders]')?.addEventListener('click', (event) => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Todos os pedidos estão visíveis';
    showToast('Lista completa carregada para demonstração.');
  });

  document.querySelectorAll('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => showToast(button.dataset.toast));
  });

  document.querySelector('.date-control select')?.addEventListener('change', (event) => {
    showToast(`Período alterado para: ${event.target.value}.`);
  });
})();

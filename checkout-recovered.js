(async () => {
  if (!window.CacarolaSupabase) {
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'supabase-config.js?v=2';
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }
  const api = window.CacarolaSupabase;
  if (!api?.primecashRequest) {
    const unavailableButton = [...document.querySelectorAll('.tt-btn')].find((button) => /ir para a entrega/i.test(button.textContent));
    if (unavailableButton) {
      unavailableButton.disabled = true;
      unavailableButton.textContent = 'RECARREGUE A PÁGINA';
    }
    return;
  }
  api?.track('checkout_view');
  document.querySelector('#sup-btn')?.remove();
  document.querySelector('#sup-panel')?.remove();
  const money = (value) => value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const fallbackItems = [{
    name: 'Mármore',
    price: 87.9,
    qty: 1,
    image: 'cart-marmore.png'
  }];

  let storedCart;
  try {
    storedCart = JSON.parse(sessionStorage.getItem('colinoxCart') || 'null');
  } catch {
    storedCart = null;
  }

  const items = Array.isArray(storedCart?.items) && storedCart.items.length
    ? storedCart.items.filter((item) => item && item.qty > 0)
    : fallbackItems;

  const cartSection = document.querySelector('main > section');
  if (!cartSection || !items.length) return;

  document.title = 'Checkout | Kit 10 Peças Colinox';

  const toggle = cartSection.querySelector(':scope > button');
  const countBadge = toggle?.querySelector('span');
  const templateRow = cartSection.children[1];
  const firstDivider = cartSection.children[2];
  const totals = cartSection.children[3];
  const totalRow = cartSection.children[5];
  const renderedRows = [];

  const refreshTotals = () => {
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.qty, 0);

    if (countBadge) countBadge.textContent = String(totalItems);
    const subtotalValue = totals?.children[0]?.lastElementChild;
    const totalValue = totalRow?.lastElementChild;
    if (subtotalValue) subtotalValue.textContent = money(totalPrice);
    if (totalValue) totalValue.textContent = money(totalPrice);

    renderedRows.forEach(({ row, item }) => {
      const quantity = row.lastElementChild?.querySelector('span');
      const minus = row.lastElementChild?.querySelector('button:first-of-type');
      if (quantity) quantity.textContent = String(item.qty);
      if (minus) {
        minus.disabled = items.length === 1 && item.qty === 1;
        minus.style.opacity = minus.disabled ? '.35' : '1';
      }
    });
  };

  const prepareRow = (row, item, index) => {
    row.style.marginTop = index ? '12px' : '';
    const image = row.querySelector('img');
    const name = row.querySelector('[data-lv-cor]');
    const controls = row.lastElementChild;
    const minus = controls?.querySelector('button:first-of-type');
    const plus = controls?.querySelector('button:last-of-type');

    if (image) {
      image.src = item.image || 'cart-marmore.png';
      image.alt = `Kit 10 Peças Colinox - ${item.name}`;
      image.style.objectFit = 'contain';
      image.style.background = '#fff';
    }
    if (name) name.textContent = `Kit 10 peças Mimo/Colinox - ${item.name}`;

    if (minus) {
      minus.type = 'button';
      minus.setAttribute('aria-label', `Diminuir quantidade de ${item.name}`);
      minus.addEventListener('click', () => {
        item.qty = Math.max(1, item.qty - 1);
        refreshTotals();
      });
    }
    if (plus) {
      plus.type = 'button';
      plus.setAttribute('aria-label', `Aumentar quantidade de ${item.name}`);
      plus.addEventListener('click', () => {
        item.qty = Math.min(99, item.qty + 1);
        refreshTotals();
      });
    }

    renderedRows.push({ row, item });
  };

  items.forEach((item, index) => {
    const row = index === 0 ? templateRow : templateRow.cloneNode(true);
    if (index) cartSection.insertBefore(row, firstDivider);
    prepareRow(row, item, index);
  });

  if (toggle) {
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      [...cartSection.children].slice(1).forEach((element) => {
        element.hidden = expanded;
      });
      const icon = toggle.querySelector('svg');
      if (icon) icon.style.transform = expanded ? 'rotate(180deg)' : '';
    });
  }

  let checkoutButton = [...document.querySelectorAll('.tt-btn')].find((button) => /ir para a entrega/i.test(button.textContent));
  const fields = [...document.querySelectorAll('.tt-input')].slice(0, 4);
  const progressSection = cartSection.nextElementSibling;
  const formSection = progressSection?.nextElementSibling;
  const identificationContent = formSection?.firstElementChild;
  const productIds = { 'mármore': 'marmore', marmore: 'marmore', quartzo: 'quartzo', grafite: 'grafite', oliva: 'oliva' };
  const purchase = { customer: null, shipping: null };
  let formMessage;
  const showFormMessage = (message, error = false) => {
    if (!formMessage) {
      formMessage = document.createElement('p');
      formMessage.dataset.checkoutMessage = 'true';
      formMessage.style.cssText = 'margin:0;font-size:12px;line-height:1.45;text-align:center;padding:10px;border-radius:10px';
      checkoutButton?.before(formMessage);
    }
    formMessage.textContent = message;
    formMessage.style.color = error ? '#b42342' : '#087a50';
    formMessage.style.background = error ? '#fff0f3' : '#e8f8f0';
  };

  const setStep = (activeStep) => {
    const steps = progressSection?.querySelectorAll(':scope > div > div');
    steps?.forEach((step, index) => {
      const circle = step.querySelector('.relative.z-10');
      const label = step.querySelector('span');
      const completed = index + 1 < activeStep;
      const active = index + 1 === activeStep;
      if (circle) {
        circle.textContent = completed ? '✓' : String(index + 1);
        circle.style.background = completed ? 'rgb(16 185 129)' : active ? 'rgb(23 23 23)' : 'rgb(245 245 245)';
        circle.style.color = completed || active ? '#fff' : 'rgb(163 163 163)';
      }
      if (label) {
        label.style.color = active ? 'rgb(23 23 23)' : completed ? 'rgb(5 150 105)' : 'rgb(115 115 115)';
        label.style.fontWeight = active || completed ? '600' : '400';
      }
    });
    formSection?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const resetMessage = () => { formMessage = null; };

  const renderDelivery = () => {
    if (!formSection) return;
    formSection.innerHTML = `<div class="space-y-4">
      <div><h2 style="font-size:18px;font-weight:700;color:rgb(23 23 23);margin:0">Onde devemos entregar?</h2><p style="font-size:12px;color:rgb(115 115 115);margin:5px 0 0">Informe o endereço que receberá o seu pedido.</p></div>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">CEP</span><input class="tt-input" name="postalCode" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" aria-describedby="postal-code-help"><span id="postal-code-help" role="status" aria-live="polite" style="display:block;min-height:18px;margin-top:6px;font-size:11px;line-height:1.45;color:rgb(115 115 115)">Digite o CEP para preencher o endereço automaticamente.</span></label>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Endereço</span><input class="tt-input" name="street" autocomplete="street-address" maxlength="140" placeholder="Rua ou avenida"></label>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:12px"><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Número</span><input class="tt-input" name="number" autocomplete="address-line2" maxlength="20" placeholder="123"></label><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Complemento</span><input class="tt-input" name="complement" maxlength="80" placeholder="Opcional"></label></div>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Bairro</span><input class="tt-input" name="neighborhood" maxlength="100" placeholder="Seu bairro"></label>
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(82px,.7fr);gap:12px"><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Cidade</span><input class="tt-input" name="city" autocomplete="address-level2" maxlength="100" placeholder="Cidade"></label><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">UF</span><input class="tt-input" name="state" autocomplete="address-level1" maxlength="2" placeholder="SP" style="text-transform:uppercase"></label></div>
      <div style="border:1px solid rgb(209 250 229);background:rgb(236 253 245);border-radius:12px;padding:13px 14px"><strong style="display:block;font-size:13px;color:rgb(6 95 70)">Frete grátis</strong><span style="font-size:12px;color:rgb(4 120 87)">Entrega segura para todo o Brasil.</span></div>
      <div style="display:grid;grid-template-columns:96px 1fr;gap:10px"><button class="tt-btn" type="button" data-back-identification style="background:#fff;color:rgb(23 23 23);border:1px solid rgb(229 229 229)">VOLTAR</button><button class="tt-btn" type="button" data-go-payment>IR PARA O PAGAMENTO</button></div>
    </div>`;
    resetMessage();
    if (purchase.shipping) {
      Object.entries(purchase.shipping).forEach(([name, value]) => {
        const input = formSection.querySelector(`[name="${name}"]`);
        if (input) input.value = value;
      });
    }
    checkoutButton = formSection.querySelector('[data-go-payment]');
    const postalCodeInput = formSection.querySelector('[name="postalCode"]');
    const postalCodeHelp = formSection.querySelector('#postal-code-help');
    let postalCodeRequest;
    let postalCodeTimer;
    let lastResolvedPostalCode = '';
    const setPostalCodeHelp = (message, type = 'neutral') => {
      if (!postalCodeHelp) return;
      postalCodeHelp.textContent = message;
      postalCodeHelp.style.color = type === 'error' ? '#b42342' : type === 'success' ? '#087a50' : 'rgb(115 115 115)';
    };
    const formatPostalCode = (value) => {
      const digits = value.replace(/\D/g, '').slice(0, 8);
      return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    };
    const lookupPostalCodeWithScript = (postalCode, signal) => new Promise((resolve, reject) => {
      const callback = `__postalCodeLookup${Date.now()}${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => {
        script.remove();
        delete window[callback];
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Consulta cancelada.', 'AbortError'));
      };
      window[callback] = (address) => {
        cleanup();
        resolve(address);
      };
      script.async = true;
      script.src = `/buscar-endereco?cep=${postalCode}&callback=${encodeURIComponent(callback)}`;
      script.onerror = () => {
        cleanup();
        reject(new Error('script-lookup-failed'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      document.head.append(script);
    });
    const fillAddressFromPostalCode = async () => {
      const postalCode = postalCodeInput?.value.replace(/\D/g, '') || '';
      if (postalCode.length !== 8 || postalCode === lastResolvedPostalCode) return;
      postalCodeRequest?.abort();
      const controller = new AbortController();
      postalCodeRequest = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);
      postalCodeInput.setAttribute('aria-busy', 'true');
      setPostalCodeHelp('Buscando endereço...');
      try {
        let address;
        try {
          const response = await fetch(`/buscar-endereco?cep=${postalCode}`, {
            headers: { Accept: 'application/json' }, signal: controller.signal
          });
          if (response.status === 404) address = { error: 'not_found' };
          else {
            if (!response.ok) throw new Error('lookup-failed');
            address = await response.json();
          }
        } catch (lookupError) {
          if (controller.signal.aborted) throw lookupError;
          address = await lookupPostalCodeWithScript(postalCode, controller.signal);
        }
        if (address.error === 'not_found') {
          lastResolvedPostalCode = postalCode;
          setPostalCodeHelp('CEP não encontrado. Confira o número ou preencha o endereço manualmente.', 'error');
          return;
        }
        if (address.error) throw new Error(address.error);
        const values = {
          street: address.street,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state
        };
        Object.entries(values).forEach(([name, value]) => {
          const input = formSection.querySelector(`[name="${name}"]`);
          if (input && value) input.value = value;
        });
        lastResolvedPostalCode = postalCode;
        setPostalCodeHelp('Endereço encontrado. Confira os dados e informe o número.', 'success');
        if (document.activeElement === postalCodeInput) formSection.querySelector('[name="number"]')?.focus();
      } catch (error) {
        if (error.name !== 'AbortError' || timedOut) setPostalCodeHelp('Não foi possível buscar agora. Continue preenchendo manualmente.', 'error');
      } finally {
        clearTimeout(timeout);
        if (postalCodeRequest === controller) postalCodeInput?.removeAttribute('aria-busy');
      }
    };
    postalCodeInput?.addEventListener('input', () => {
      postalCodeInput.value = formatPostalCode(postalCodeInput.value);
      clearTimeout(postalCodeTimer);
      const postalCode = postalCodeInput.value.replace(/\D/g, '');
      if (postalCode.length < 8) {
        lastResolvedPostalCode = '';
        postalCodeRequest?.abort();
        setPostalCodeHelp('Digite o CEP para preencher o endereço automaticamente.');
        return;
      }
      postalCodeTimer = setTimeout(fillAddressFromPostalCode, 250);
    });
    postalCodeInput?.addEventListener('blur', fillAddressFromPostalCode);
    formSection.querySelector('[data-back-identification]')?.addEventListener('click', () => {
      if (!identificationContent) return location.reload();
      identificationContent.querySelector('[data-checkout-message]')?.remove();
      formSection.replaceChildren(identificationContent);
      formMessage = null;
      checkoutButton = [...identificationContent.querySelectorAll('.tt-btn')].find((button) => /ir para a entrega/i.test(button.textContent));
      setStep(1);
    });
    checkoutButton.addEventListener('click', () => {
      const value = (name) => formSection.querySelector(`[name="${name}"]`)?.value.trim() || '';
      const shipping = {
        postalCode: value('postalCode').replace(/\D/g, ''), street: value('street'), number: value('number'),
        complement: value('complement'), neighborhood: value('neighborhood'), city: value('city'), state: value('state').toUpperCase()
      };
      if (shipping.postalCode.length !== 8) return showFormMessage('Informe um CEP válido.', true);
      if (!shipping.street || !shipping.number || !shipping.neighborhood || !shipping.city || shipping.state.length !== 2) return showFormMessage('Preencha o endereço completo para continuar.', true);
      purchase.shipping = shipping;
      renderPayment();
    });
    setStep(2);
  };

  const createPayment = async (button) => {
    button.disabled = true;
    button.textContent = 'ABRINDO PAGAMENTO...';
    try {
      await api?.track('checkout_started', { item_count: items.reduce((sum, item) => sum + item.qty, 0) });
      const data = await api.primecashRequest('/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: purchase.customer,
          shipping: purchase.shipping,
          items: items.map((item) => ({
            productId: productIds[item.name.toLocaleLowerCase('pt-BR')] || item.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
            quantity: item.qty
          }))
        })
      });
      if (!data.secureUrl) throw new Error('Não foi possível abrir o pagamento.');
      showFormMessage('Pedido criado. Redirecionando para o pagamento seguro...');
      button.textContent = 'REDIRECIONANDO...';
      location.assign(data.secureUrl);
    } catch (error) {
      showFormMessage(error.message, true);
      button.disabled = false;
      button.textContent = 'CONTINUAR PARA PAGAMENTO';
    }
  };

  const renderPayment = () => {
    if (!formSection) return;
    const address = escapeHtml(`${purchase.shipping.street}, ${purchase.shipping.number}${purchase.shipping.complement ? `, ${purchase.shipping.complement}` : ''} — ${purchase.shipping.city}/${purchase.shipping.state}`);
    formSection.innerHTML = `<div class="space-y-4">
      <div><h2 style="font-size:18px;font-weight:700;color:rgb(23 23 23);margin:0">Pagamento seguro</h2><p style="font-size:12px;color:rgb(115 115 115);margin:5px 0 0">Conclua sua compra via Pix em um ambiente protegido.</p></div>
      <div style="border:1px solid rgb(229 229 229);border-radius:14px;padding:15px;display:grid;gap:9px"><div style="display:flex;justify-content:space-between;gap:16px;font-size:12px"><span style="color:rgb(115 115 115)">Cliente</span><strong style="text-align:right;color:rgb(23 23 23)">${escapeHtml(purchase.customer.name)}</strong></div><div style="display:flex;justify-content:space-between;gap:16px;font-size:12px"><span style="color:rgb(115 115 115)">Entrega</span><strong style="text-align:right;color:rgb(23 23 23)">${address}</strong></div><div style="display:flex;justify-content:space-between;gap:16px;font-size:13px;padding-top:10px;border-top:1px solid rgb(245 245 245)"><span style="color:rgb(64 64 64)">Total</span><strong style="color:rgb(23 23 23)">${money(items.reduce((sum, item) => sum + item.price * item.qty, 0))}</strong></div></div>
      <div style="display:grid;grid-template-columns:96px 1fr;gap:10px"><button class="tt-btn" type="button" data-back-delivery style="background:#fff;color:rgb(23 23 23);border:1px solid rgb(229 229 229)">VOLTAR</button><button class="tt-btn" type="button" data-create-payment>CONTINUAR PARA PAGAMENTO</button></div>
      <p style="font-size:11px;line-height:1.45;text-align:center;color:rgb(115 115 115);margin:0">Ao continuar, você será redirecionado para concluir o pagamento.</p>
    </div>`;
    resetMessage();
    checkoutButton = formSection.querySelector('[data-create-payment]');
    formSection.querySelector('[data-back-delivery]')?.addEventListener('click', renderDelivery);
    checkoutButton.addEventListener('click', () => createPayment(checkoutButton));
    setStep(3);
  };

  checkoutButton?.addEventListener('click', (event) => {
    event.preventDefault();
    if (fields.length < 4) return showFormMessage('A conexão segura não está disponível. Recarregue a página.', true);
    const [email, phone, customerName, taxId] = fields.map((field) => field.value.trim());
    const phoneDigits = phone.replace(/\D/g, '');
    const taxDigits = taxId.replace(/\D/g, '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showFormMessage('Informe um e-mail válido.', true);
    if (phoneDigits.length < 10) return showFormMessage('Informe um telefone válido com DDD.', true);
    if (customerName.split(/\s+/).length < 2) return showFormMessage('Informe seu nome completo.', true);
    if (![11, 14].includes(taxDigits.length)) return showFormMessage('Informe um CPF ou CNPJ válido.', true);
    purchase.customer = { name: customerName, email, phone: phoneDigits, taxId: taxDigits };
    renderDelivery();
  });

  refreshTotals();
})();

(async () => {
  if (!window.CacarolaSupabase) {
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'supabase-config.js?v=7';
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

  const orderBumps = [
    { id: 'jantar', title: 'Jogo de Jantar 10 Peças Oxford Ryo Maresia', oldPrice: 189.9, price: 46.2, discount: '-78%', tag: 'Somente hoje esse valor', image: 'assets/checkout/order-bump-jantar.png' },
    { id: 'potes', title: 'Kit 10 Potes de Vidro Herméticos Colinox', oldPrice: 139.9, price: 36.45, discount: '-77%', image: 'assets/checkout/order-bump-potes.png' },
    { id: 'panela', title: 'Panela de Pressão Colinox Antiaderente 4,2L', oldPrice: 219.9, price: 55.47, discount: '-75%', tag: 'Mais vendida', image: 'assets/checkout/order-bump-panela.png' }
  ];
  const shippingMethods = [
    { id: 'free', title: 'Frete Grátis', description: 'Entrega em 10 a 12 dias', price: 0, image: 'assets/checkout/shipping-free.jpg' },
    { id: 'jadlog', title: 'JADLOG', description: 'Entrega em até 5 dias úteis', price: 18.47, image: 'assets/checkout/shipping-jadlog.jpg' },
    { id: 'sedex-12', title: 'SEDEX 12', description: 'Entrega de 12h a 24h', price: 33.4, image: 'assets/checkout/shipping-sedex.png' }
  ];
  const purchase = { customer: null, shipping: null, addons: [], shippingMethod: 'free' };
  let paymentPollTimer = null;

  const extrasStyle = document.createElement('style');
  extrasStyle.id = 'checkout-extras-style';
  extrasStyle.textContent = `
    .checkout-extras{display:grid;gap:16px;margin-top:4px}.checkout-extras__heading{margin:0;font-size:15px;font-weight:800;color:#111827}.checkout-extras__sub{margin:3px 0 0;font-size:12px;line-height:1.45;color:#6b7280}
    .checkout-options{display:grid;gap:10px;margin-top:11px}.checkout-option{position:relative;width:100%;min-height:88px;display:grid;grid-template-columns:22px 68px minmax(0,1fr);align-items:center;gap:10px;padding:10px;border:1.5px solid #e5e7eb;border-radius:14px;background:#fff;color:#111827;text-align:left;cursor:pointer;transition:border-color .16s ease,background-color .16s ease,box-shadow .16s ease,transform .16s ease}
    .checkout-option:hover{border-color:#fda4b8}.checkout-option:focus-visible{outline:3px solid rgba(239,47,88,.22);outline-offset:2px}.checkout-option[aria-pressed=true],.checkout-option[aria-checked=true]{border-color:#ef2f58;background:#fff7f9;box-shadow:0 0 0 1px rgba(239,47,88,.06)}
    .checkout-option__check{width:20px;height:20px;display:grid;place-items:center;border:2px solid #d1d5db;border-radius:50%;background:#fff;font-size:12px;font-weight:900;color:#fff}.checkout-option[aria-pressed=true] .checkout-option__check,.checkout-option[aria-checked=true] .checkout-option__check{border-color:#ef2f58;background:#ef2f58}.checkout-option[aria-pressed=true] .checkout-option__check::after,.checkout-option[aria-checked=true] .checkout-option__check::after{content:'✓'}
    .checkout-option__image{width:68px;height:68px;display:block;border-radius:10px;object-fit:contain;background:#f8fafc}.checkout-option__content{min-width:0}.checkout-option__title{display:block;font-size:13px;font-weight:750;line-height:1.3}.checkout-option__prices{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px}.checkout-option__discount{padding:2px 6px;border-radius:6px;background:#e11d48;color:#fff;font-size:10px;font-weight:800}.checkout-option__old{font-size:11px;color:#9ca3af;text-decoration:line-through}.checkout-option__price{display:block;margin-top:3px;color:#059669;font-size:15px;font-weight:850}.checkout-option__tag{position:absolute;top:-9px;right:10px;padding:4px 9px;border-radius:999px;background:linear-gradient(135deg,#f6d365,#b8860b);color:#3b2a05;font-size:9px;font-weight:850;letter-spacing:.45px;text-transform:uppercase;box-shadow:0 4px 10px rgba(184,134,11,.25)}
    .shipping-option{grid-template-columns:22px 58px minmax(0,1fr) auto;min-height:76px}.shipping-option .checkout-option__image{width:58px;height:48px}.shipping-option__price{font-size:13px;font-weight:800;color:#111827;white-space:nowrap}.shipping-option__description{display:block;margin-top:3px;font-size:11px;color:#6b7280}
    .checkout-breakdown{display:grid;gap:8px;padding:13px 14px;border:1px solid #e5e7eb;border-radius:13px;background:#fafafa}.checkout-breakdown__row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#6b7280}.checkout-breakdown__row strong{color:#111827}.checkout-breakdown__row--total{padding-top:9px;border-top:1px solid #e5e7eb;font-size:14px;color:#111827}
    @media(max-width:390px){.checkout-option{grid-template-columns:20px 58px minmax(0,1fr);gap:8px}.checkout-option__image{width:58px;height:58px}.shipping-option{grid-template-columns:20px 48px minmax(0,1fr)}.shipping-option .checkout-option__image{width:48px;height:42px}.shipping-option__price{grid-column:3;margin-top:3px}}
    @media(prefers-reduced-motion:reduce){.checkout-option{transition:none}}
  `;
  document.head.appendChild(extrasStyle);

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

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const addons = orderBumps.filter((offer) => purchase.addons.includes(offer.id)).reduce((sum, offer) => sum + offer.price, 0);
    const shipping = shippingMethods.find((method) => method.id === purchase.shippingMethod)?.price || 0;
    return { subtotal, addons, shipping, total: subtotal + addons + shipping };
  };

  const refreshTotals = () => {
    const selectedAddonCount = purchase.addons.length;
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0) + selectedAddonCount;
    const prices = calculateTotals();

    if (countBadge) countBadge.textContent = String(totalItems);
    const subtotalValue = totals?.children[0]?.lastElementChild;
    const shippingName = totals?.querySelector('.lv-frete-name');
    const shippingValue = totals?.children[1]?.lastElementChild;
    const totalValue = totalRow?.lastElementChild;
    if (subtotalValue) subtotalValue.textContent = money(prices.subtotal + prices.addons);
    const selectedShipping = shippingMethods.find((method) => method.id === purchase.shippingMethod) || shippingMethods[0];
    if (shippingName) shippingName.textContent = selectedShipping.title;
    if (shippingValue) shippingValue.textContent = prices.shipping ? money(prices.shipping) : 'Grátis';
    if (totalValue) totalValue.textContent = money(prices.total);
    document.querySelectorAll('[data-checkout-subtotal]').forEach((element) => { element.textContent = money(prices.subtotal); });
    document.querySelectorAll('[data-checkout-addons]').forEach((element) => { element.textContent = money(prices.addons); });
    document.querySelectorAll('[data-checkout-shipping]').forEach((element) => { element.textContent = prices.shipping ? money(prices.shipping) : 'Grátis'; });
    document.querySelectorAll('[data-checkout-grand-total]').forEach((element) => { element.textContent = money(prices.total); });

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
  let formMessage;
  const showFormMessage = (message, error = false) => {
    if (!formMessage) {
      formMessage = document.createElement('p');
      formMessage.dataset.checkoutMessage = 'true';
      formMessage.style.cssText = 'width:100%;box-sizing:border-box;margin:0;font-size:12px;line-height:1.45;text-align:center;padding:10px 12px;border-radius:10px';
      const buttonContainer = checkoutButton?.parentElement;
      const messageAnchor = buttonContainer?.querySelectorAll(':scope > button').length > 1 ? buttonContainer : checkoutButton;
      messageAnchor?.before(formMessage);
    }
    formMessage.setAttribute('role', error ? 'alert' : 'status');
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

  const orderBumpsMarkup = () => `<section class="checkout-extras" aria-labelledby="checkout-bumps-title">
    <div><h3 class="checkout-extras__heading" id="checkout-bumps-title">Adicione essas ofertas na sua compra</h3><p class="checkout-extras__sub">Aproveite os valores especiais. Você pode escolher mais de uma oferta.</p></div>
    <div class="checkout-options">${orderBumps.map((offer) => {
      const selected = purchase.addons.includes(offer.id);
      return `<button class="checkout-option" type="button" data-addon-id="${offer.id}" aria-pressed="${selected}">
        ${offer.tag ? `<span class="checkout-option__tag">${escapeHtml(offer.tag)}</span>` : ''}<span class="checkout-option__check" aria-hidden="true"></span>
        <img class="checkout-option__image" src="${offer.image}" width="68" height="68" loading="lazy" decoding="async" alt="">
        <span class="checkout-option__content"><span class="checkout-option__title">${escapeHtml(offer.title)}</span><span class="checkout-option__prices"><span class="checkout-option__discount">${offer.discount}</span><span class="checkout-option__old">${money(offer.oldPrice)}</span></span><span class="checkout-option__price">+ ${money(offer.price)}</span></span>
      </button>`;
    }).join('')}</div>
  </section>`;

  const shippingMethodsMarkup = () => `<fieldset class="checkout-extras" style="border:0;padding:0;margin:0" aria-describedby="shipping-method-help">
    <div><legend class="checkout-extras__heading">Escolha uma forma de entrega:</legend><p class="checkout-extras__sub" id="shipping-method-help">Selecione o prazo e o valor que preferir.</p></div>
    <div class="checkout-options" role="radiogroup">${shippingMethods.map((method) => {
      const selected = method.id === purchase.shippingMethod;
      return `<button class="checkout-option shipping-option" type="button" role="radio" data-shipping-method="${method.id}" aria-checked="${selected}">
        <span class="checkout-option__check" aria-hidden="true"></span><img class="checkout-option__image" src="${method.image}" width="58" height="48" loading="lazy" decoding="async" alt="">
        <span class="checkout-option__content"><span class="checkout-option__title">${escapeHtml(method.title)}</span><span class="shipping-option__description">${escapeHtml(method.description)}</span></span><span class="shipping-option__price">${method.price ? money(method.price) : 'Grátis'}</span>
      </button>`;
    }).join('')}</div>
  </fieldset>`;

  const totalsMarkup = () => {
    const prices = calculateTotals();
    return `<div class="checkout-breakdown" aria-live="polite">
      <div class="checkout-breakdown__row"><span>Produtos</span><strong data-checkout-subtotal>${money(prices.subtotal)}</strong></div>
      <div class="checkout-breakdown__row"><span>Ofertas adicionais</span><strong data-checkout-addons>${money(prices.addons)}</strong></div>
      <div class="checkout-breakdown__row"><span>Entrega</span><strong data-checkout-shipping>${prices.shipping ? money(prices.shipping) : 'Grátis'}</strong></div>
      <div class="checkout-breakdown__row checkout-breakdown__row--total"><strong>Total</strong><strong data-checkout-grand-total>${money(prices.total)}</strong></div>
    </div>`;
  };

  const renderDelivery = () => {
    if (!formSection) return;
    formSection.innerHTML = `<div class="space-y-4">
      <div><h2 style="font-size:18px;font-weight:700;color:rgb(23 23 23);margin:0">Onde devemos entregar?</h2><p style="font-size:12px;color:rgb(115 115 115);margin:5px 0 0">Informe o endereço que receberá o seu pedido.</p></div>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">CEP</span><input class="tt-input" name="postalCode" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" aria-describedby="postal-code-help"><span id="postal-code-help" role="status" aria-live="polite" style="display:block;min-height:18px;margin-top:6px;font-size:11px;line-height:1.45;color:rgb(115 115 115)">Digite o CEP para preencher o endereço automaticamente.</span></label>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Endereço</span><input class="tt-input" name="street" autocomplete="street-address" maxlength="140" placeholder="Rua ou avenida"></label>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:12px"><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Número</span><input class="tt-input" name="number" autocomplete="address-line2" maxlength="20" placeholder="123"></label><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Complemento</span><input class="tt-input" name="complement" maxlength="80" placeholder="Opcional"></label></div>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Bairro</span><input class="tt-input" name="neighborhood" maxlength="100" placeholder="Seu bairro"></label>
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(82px,.7fr);gap:12px"><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Cidade</span><input class="tt-input" name="city" autocomplete="address-level2" maxlength="100" placeholder="Cidade"></label><label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">UF</span><input class="tt-input" name="state" autocomplete="address-level1" maxlength="2" placeholder="SP" style="text-transform:uppercase"></label></div>
      ${orderBumpsMarkup()}
      ${shippingMethodsMarkup()}
      ${totalsMarkup()}
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
    formSection.querySelectorAll('[data-addon-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const addonId = button.dataset.addonId;
        purchase.addons = purchase.addons.includes(addonId)
          ? purchase.addons.filter((id) => id !== addonId)
          : [...purchase.addons, addonId];
        button.setAttribute('aria-pressed', String(purchase.addons.includes(addonId)));
        refreshTotals();
      });
    });
    formSection.querySelectorAll('[data-shipping-method]').forEach((button) => {
      button.addEventListener('click', () => {
        purchase.shippingMethod = button.dataset.shippingMethod;
        formSection.querySelectorAll('[data-shipping-method]').forEach((option) => option.setAttribute('aria-checked', String(option === button)));
        refreshTotals();
      });
    });
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
      await api?.track('checkout_started', { item_count: items.reduce((sum, item) => sum + item.qty, 0) + purchase.addons.length });
      const data = await api.primecashRequest('/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customer: purchase.customer,
          shipping: purchase.shipping,
          addons: purchase.addons,
          shippingMethod: purchase.shippingMethod,
          items: items.map((item) => ({
            productId: productIds[item.name.toLocaleLowerCase('pt-BR')] || item.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
            quantity: item.qty
          }))
        })
      });
      if (!data.pixCode || !data.qrCodeImage) throw new Error('Não foi possível gerar o Pix.');
      renderPixPayment(data);
    } catch (error) {
      const customerMessage = /gateway|primecash|titans|provedor|administrador|configurad|desativad|invalid values|validation error/i.test(error.message)
        ? 'Pagamento temporariamente indisponível. Tente novamente mais tarde.'
        : error.message;
      showFormMessage(customerMessage, true);
      button.disabled = false;
      button.textContent = 'CONTINUAR PARA PAGAMENTO';
    }
  };

  const renderPixPayment = (payment) => {
    if (!formSection) return;
    const expiration = payment.expiresAt
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${payment.expiresAt}T12:00:00`))
      : '';
    formSection.innerHTML = `<div class="space-y-4">
      <div><h2 style="font-size:18px;font-weight:700;color:rgb(23 23 23);margin:0">Pague com Pix</h2><p style="font-size:12px;color:rgb(115 115 115);margin:5px 0 0">Escaneie o QR Code ou copie o código abaixo.</p></div>
      <div style="border:1px solid rgb(229 229 229);border-radius:16px;padding:16px;display:grid;place-items:center;gap:10px;background:#fff"><img data-pix-qr width="220" height="220" alt="QR Code Pix para pagamento" style="display:block;width:min(220px,72vw);height:auto;aspect-ratio:1;background:#fff"><strong style="font-size:17px;color:rgb(23 23 23)">${money(Number(payment.amount) || calculateTotals().total)}</strong>${expiration ? `<span style="font-size:11px;color:rgb(115 115 115)">Válido até ${escapeHtml(expiration)}</span>` : ''}</div>
      <label class="block"><span class="block text-[13px] font-medium text-neutral-800 mb-1.5">Pix copia e cola</span><textarea data-pix-code readonly rows="3" style="width:100%;box-sizing:border-box;resize:none;border:1px solid rgb(229 229 229);border-radius:12px;padding:11px 12px;background:rgb(250 250 250);color:rgb(64 64 64);font:500 11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere"></textarea></label>
      <button class="tt-btn" type="button" data-copy-pix>COPIAR CÓDIGO PIX</button>
      <p data-pix-copy-status role="status" aria-live="polite" style="min-height:17px;margin:0;text-align:center;font-size:11px;color:rgb(5 150 105)"></p>
      <p data-payment-status role="status" aria-live="polite" style="margin:0;text-align:center;font-size:12px;line-height:1.5;color:rgb(115 115 115);font-weight:700">Aguardando pagamento...</p>
      <p style="margin:0;text-align:center;font-size:10px;line-height:1.5;color:rgb(163 163 163)">Pedido #${escapeHtml(payment.orderId)}</p>
    </div>`;
    const qrImage = formSection.querySelector('[data-pix-qr]');
    const pixCode = formSection.querySelector('[data-pix-code]');
    const copyStatus = formSection.querySelector('[data-pix-copy-status]');
    if (qrImage) qrImage.src = payment.qrCodeImage;
    if (pixCode) pixCode.value = payment.pixCode;
    formSection.querySelector('[data-copy-pix]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(payment.pixCode);
      } catch {
        pixCode?.select();
        document.execCommand('copy');
      }
      button.textContent = 'CÓDIGO COPIADO';
      if (copyStatus) copyStatus.textContent = 'Código Pix copiado. Abra o aplicativo do seu banco para pagar.';
      setTimeout(() => { button.textContent = 'COPIAR CÓDIGO PIX'; }, 2500);
    });
    resetMessage();
    checkoutButton = formSection.querySelector('[data-copy-pix]');
    setStep(3);
    if (payment.statusToken) {
      clearInterval(paymentPollTimer);
      const checkStatus = async () => {
        if (document.hidden) return;
        try {
          const result = await api.primecashRequest(`/payment-status?orderId=${encodeURIComponent(payment.orderId)}&token=${encodeURIComponent(payment.statusToken)}`);
          const status = formSection.querySelector('[data-payment-status]');
          if (!status) return clearInterval(paymentPollTimer);
          if (result.status === 'paid') {
            clearInterval(paymentPollTimer);
            status.textContent = 'Pagamento confirmado';
            status.style.color = 'rgb(5 150 105)';
            const copyButton = formSection.querySelector('[data-copy-pix]');
            if (copyButton) { copyButton.disabled = true; copyButton.textContent = 'PAGAMENTO CONFIRMADO'; }
          } else if (result.status === 'cancelled') {
            clearInterval(paymentPollTimer);
            status.textContent = 'Pagamento não concluído';
            status.style.color = 'rgb(225 29 72)';
          }
        } catch { /* Mantém o estado atual e tenta novamente sem interromper o cliente. */ }
      };
      checkStatus();
      paymentPollTimer = setInterval(checkStatus, 4000);
    }
  };

  const renderPayment = () => {
    if (!formSection) return;
    const address = escapeHtml(`${purchase.shipping.street}, ${purchase.shipping.number}${purchase.shipping.complement ? `, ${purchase.shipping.complement}` : ''} — ${purchase.shipping.city}/${purchase.shipping.state}`);
    const selectedShipping = shippingMethods.find((method) => method.id === purchase.shippingMethod) || shippingMethods[0];
    formSection.innerHTML = `<div class="space-y-4">
      <div><h2 style="font-size:18px;font-weight:700;color:rgb(23 23 23);margin:0">Pagamento seguro</h2><p style="font-size:12px;color:rgb(115 115 115);margin:5px 0 0">Conclua sua compra via Pix em um ambiente protegido.</p></div>
      <div style="border:1px solid rgb(229 229 229);border-radius:14px;padding:15px;display:grid;gap:9px"><div style="display:flex;justify-content:space-between;gap:16px;font-size:12px"><span style="color:rgb(115 115 115)">Cliente</span><strong style="text-align:right;color:rgb(23 23 23)">${escapeHtml(purchase.customer.name)}</strong></div><div style="display:flex;justify-content:space-between;gap:16px;font-size:12px"><span style="color:rgb(115 115 115)">Entrega</span><strong style="text-align:right;color:rgb(23 23 23)">${address}</strong></div><div style="display:flex;justify-content:space-between;gap:16px;font-size:12px"><span style="color:rgb(115 115 115)">Modalidade</span><strong style="text-align:right;color:rgb(23 23 23)">${escapeHtml(selectedShipping.title)} · ${escapeHtml(selectedShipping.description)}</strong></div></div>
      ${totalsMarkup()}
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

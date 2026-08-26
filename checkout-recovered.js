(() => {
  const money = (value) => value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

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

  refreshTotals();
})();

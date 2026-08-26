(() => {
  document.title = 'Kit 10 Peças Colinox';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $all = (selector, root = document) => [...root.querySelectorAll(selector)];

  if (!document.querySelector('#promo-splash')) {
    document.body.insertAdjacentHTML('afterbegin', '<div id="promo-splash" style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(120% 90% at 50% 44%,rgba(254,44,85,.22),rgba(37,244,238,.10) 42%,rgba(8,6,14,.72) 78%),rgba(8,6,14,.62);backdrop-filter:blur(7px) saturate(120%);animation:psFade .3s ease both;flex-direction:column;gap:14px"><div class="ps-ring"></div><div class="ps-ring ps-ring2"></div><canvas id="promo-confetti" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" width="1042" height="892"></canvas><div class="ps-badge">PROMOÇÃO EXCLUSIVA</div><picture><img src="promo-splash.webp" srcset="promo-splash.webp 700w, promo-splash@2x.webp 1400w" sizes="(max-width:520px) 86vw, 460px" width="700" height="487" fetchpriority="high" decoding="async" alt="TikTok Show de Promo" style="position:relative;display:block;width:min(86vw,460px);height:auto;filter:drop-shadow(0 24px 48px rgba(0,0,0,.6)) drop-shadow(0 0 30px rgba(254,44,85,.4));animation:psPop .5s cubic-bezier(.18,.9,.3,1.35) both,psFloat 2.8s ease-in-out .55s infinite;will-change:transform"></picture></div>');
  }

  const promoSplash = document.querySelector('#promo-splash');
  if (promoSplash) {
    document.body.classList.add('has-promo-splash');
    const canvas = document.querySelector('#promo-confetti');
    const context = canvas?.getContext('2d');
    let frameId;
    let closed = false;
    const particles = [];
    const colors = ['#fe2c55', '#25f4ee', '#ffffff', '#ffd166', '#ff7aa2'];

    const resizeCanvas = () => {
      if (!canvas || !context) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * ratio);
      canvas.height = Math.round(innerHeight * ratio);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const seedConfetti = () => {
      if (reduceMotion) return;
      for (let index = 0; index < 90; index += 1) {
        particles.push({
          x: innerWidth * (.2 + Math.random() * .6),
          y: innerHeight * (.35 + Math.random() * .12),
          vx: (Math.random() - .5) * 10,
          vy: -4 - Math.random() * 9,
          gravity: .12 + Math.random() * .08,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - .5) * .22,
          width: 5 + Math.random() * 7,
          height: 3 + Math.random() * 4,
          color: colors[index % colors.length],
          alpha: .75 + Math.random() * .25
        });
      }
    };

    const drawConfetti = () => {
      if (!canvas || !context || closed) return;
      context.clearRect(0, 0, innerWidth, innerHeight);
      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += particle.gravity;
        particle.vx *= .993;
        particle.rotation += particle.spin;
        context.save();
        context.globalAlpha = particle.alpha;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
        context.restore();
      });
      frameId = requestAnimationFrame(drawConfetti);
    };

    const closePromo = () => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frameId);
      promoSplash.classList.add('is-leaving');
      document.body.classList.remove('has-promo-splash');
      setTimeout(() => promoSplash.remove(), reduceMotion ? 30 : 420);
    };

    resizeCanvas();
    seedConfetti();
    drawConfetti();
    addEventListener('resize', resizeCanvas, { passive: true });
    promoSplash.addEventListener('click', closePromo);
    addEventListener('keydown', (event) => { if (event.key === 'Escape') closePromo(); }, { once: true });
    setTimeout(closePromo, reduceMotion ? 500 : 3200);
  }

  document.documentElement.classList.add('motion-ready');

  const revealTargets = $all('main > *, section, article').filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.height > 24 && rect.width > 120;
  });
  revealTargets.forEach((element, index) => {
    element.dataset.motionReveal = '';
    element.style.setProperty('--motion-delay', `${Math.min(index % 4, 3) * 55}ms`);
  });

  if (reduceMotion) {
    revealTargets.forEach((element) => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    revealTargets.forEach((element) => observer.observe(element));
  }

  const carouselSection = document.querySelector('[data-carousel]');
  const carousel = document.querySelector('#lv-carousel');
  if (carouselSection && carousel) {
    const slides = $all(':scope > .flex > *', carousel);
    const carouselButtons = $all('button', carouselSection);
    const nextButton = carouselSection.querySelector('.lv-arrow.next') || carouselButtons.find((button) =>
      /próxima/i.test(button.getAttribute('aria-label') || button.textContent)
    );
    const previousButton = carouselSection.querySelector('.lv-arrow.prev');
    const dots = $all('.lv-dot', carouselSection);
    const dotsContainer = carouselSection.querySelector('.lv-dots');
    const counter = $all('*', carouselSection).find((element) =>
      element.children.length === 0 && /^\s*\d+\s*\/\s*\d+\s*$/.test(element.textContent)
    );
    let activeIndex = 0;
    let timer;
    let targetIndex = null;
    let targetReleaseTimer;

    dotsContainer?.setAttribute('role', 'tablist');
    dots.forEach((dot, index) => {
      dot.setAttribute('aria-label', `Mostrar imagem ${index + 1}`);
      dot.setAttribute('role', 'tab');
      dot.addEventListener('click', () => {
        goTo(index);
        restart();
      });
    });

    const updateIndicators = () => {
      dotsContainer?.style.setProperty('--active-index', String(activeIndex));
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
        dot.setAttribute('aria-selected', String(index === activeIndex));
        dot.tabIndex = index === activeIndex ? 0 : -1;
      });
      if (counter) counter.textContent = `${activeIndex + 1}/${slides.length}`;
    };

    const goTo = (index, behavior = 'smooth') => {
      if (!slides.length) return;
      activeIndex = (index + slides.length) % slides.length;
      targetIndex = activeIndex;
      clearTimeout(targetReleaseTimer);
      updateIndicators();
      carousel.scrollTo({ left: activeIndex * carousel.clientWidth, behavior });
      targetReleaseTimer = setTimeout(() => { targetIndex = null; }, behavior === 'smooth' ? 700 : 0);
    };

    nextButton?.addEventListener('click', () => goTo(activeIndex + 1));
    previousButton?.addEventListener('click', () => goTo(activeIndex - 1));
    carousel.addEventListener('scroll', () => {
      if (!carousel.clientWidth) return;
      const nextIndex = Math.round(carousel.scrollLeft / carousel.clientWidth);
      if (targetIndex !== null) {
        const targetLeft = targetIndex * carousel.clientWidth;
        if (Math.abs(carousel.scrollLeft - targetLeft) < 2) targetIndex = null;
        else return;
      }
      if (nextIndex !== activeIndex) {
        activeIndex = nextIndex;
        updateIndicators();
      }
    }, { passive: true });


    const restart = () => {
      clearInterval(timer);
      if (!reduceMotion && slides.length > 1) timer = setInterval(() => goTo(activeIndex + 1), 4800);
    };
    carouselSection.addEventListener('mouseenter', () => clearInterval(timer));
    carouselSection.addEventListener('mouseleave', restart);
    carouselSection.addEventListener('focusin', () => clearInterval(timer));
    carouselSection.addEventListener('focusout', restart);
    updateIndicators();
    restart();
  }

  const countdown = $all('strong').find((element) => /^\d{2}:\d{2}:\d{2}$/.test(element.textContent.trim()));
  if (countdown) {
    let seconds = countdown.textContent.trim().split(':').reduce((total, value) => total * 60 + Number(value), 0);
    setInterval(() => {
      seconds = Math.max(0, seconds - 1);
      const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      countdown.textContent = `${hours}:${minutes}:${secs}`;
    }, 1000);
  }

  const reviews = $all('article');
  const moreButton = $all('button').find((button) => /ver mais/i.test(button.textContent));
  if (reviews.length > 4 && moreButton) {
    reviews.forEach((review, index) => {
      review.dataset.review = '';
      if (index >= 4) review.classList.add('is-collapsed');
    });
    let expanded = false;
    moreButton.addEventListener('click', () => {
      expanded = !expanded;
      reviews.slice(4).forEach((review) => review.classList.toggle('is-collapsed', !expanded));
      moreButton.firstChild.textContent = expanded ? 'Ver menos ' : 'Ver mais ';
      moreButton.setAttribute('aria-expanded', String(expanded));
    });
  }

  const termsButton = $all('button').find((button) => /termos de uso/i.test(button.textContent));
  if (termsButton) {
    const panel = document.createElement('div');
    panel.className = 'terms-local';
    panel.innerHTML = '<div><p style="padding:0 16px 18px;text-align:center;font-size:11px;line-height:1.55;color:#64748b">Esta é uma cópia local demonstrativa da página. Links de compra e serviços externos pertencem ao site original.</p></div>';
    termsButton.parentElement.append(panel);
    termsButton.setAttribute('aria-expanded', 'false');
    termsButton.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      termsButton.textContent = `Termos de Uso ${open ? '▲' : '▼'}`;
      termsButton.setAttribute('aria-expanded', String(open));
    });
  }

  const colorModal = document.querySelector('#lv-color-modal');
  if (colorModal) {
    const grid = colorModal.querySelector('#lv-color-grid');
    const cards = grid ? [...grid.children] : [];
    const marmoreImage = colorModal.querySelector('img[alt="Kit 10 Peças Colinox Mármore"]');
    if (marmoreImage) {
      marmoreImage.src = 'cart-marmore.png';
      marmoreImage.style.setProperty('background-image', 'none', 'important');
    }
    const closeButton = colorModal.querySelector('#lv-color-close');
    const headerThumb = colorModal.querySelector('#lv-color-thumb');
    const headerPrice = colorModal.querySelector('#lv-color-price');
    const headerName = colorModal.querySelector('#lv-color-name');
    const cta = colorModal.querySelector('#lv-color-cta');
    const ctaSub = colorModal.querySelector('#lv-color-ctasub');
    let lastFocused;
    let closeTimer;

    const variants = cards.map((card) => {
      const image = card.querySelector('img');
      const qtyElement = card.querySelector('[data-qty]');
      const plus = card.querySelector('[data-plus]');
      const minus = card.querySelector('[data-minus]');
      const check = card.querySelector('[data-check]');
      const name = (image?.alt || '').replace(/Kit 10 Peças Colinox\s*/i, '').trim();
      const priceElement = [...card.querySelectorAll('div')].find((element) =>
        element.children.length === 0 && /^R\$\s*[\d.,]+$/.test(element.textContent.trim())
      );
      const price = Number((priceElement?.textContent || '0').replace(/[^\d,]/g, '').replace(',', '.'));
      return { card, image, qtyElement, plus, minus, check, name, price, qty: Number(qtyElement?.textContent || 0) };
    });

    const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const updateCart = () => {
      const selected = variants.filter((variant) => variant.qty > 0);
      const totalItems = selected.reduce((sum, variant) => sum + variant.qty, 0);
      const totalPrice = selected.reduce((sum, variant) => sum + variant.price * variant.qty, 0);
      const featured = selected[0] || variants[0];

      variants.forEach((variant) => {
        const active = variant.qty > 0;
        variant.qtyElement.textContent = String(variant.qty);
        variant.check.style.display = active ? 'flex' : 'none';
        variant.card.style.border = active ? '1.5px solid rgb(232,57,92)' : '1px solid rgb(236,238,242)';
        variant.card.style.background = active ? 'rgb(255,247,249)' : 'rgb(255,255,255)';
        variant.card.setAttribute('aria-selected', String(active));
        variant.minus.style.opacity = active ? '1' : '.35';
        variant.minus.disabled = !active;
      });

      if (featured?.image && headerThumb) {
        headerThumb.setAttribute('src', featured.image.getAttribute('src') || '');
        headerThumb.style.cssText = `${featured.image.style.cssText};width:100%;height:100%;object-fit:contain`;
        headerThumb.alt = featured.image.alt;
      }
      if (headerPrice) headerPrice.textContent = money(totalPrice || featured?.price || 0);
      if (headerName) {
        headerName.textContent = totalItems === 0
          ? 'Nenhuma cor selecionada'
          : selected.length === 1
            ? `${featured.name} x${featured.qty}`
            : `${selected.length} cores • ${totalItems} itens`;
      }
      if (ctaSub) ctaSub.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'itens'} • Envio grátis`;
      if (cta) {
        cta.disabled = totalItems === 0;
        cta.style.opacity = totalItems === 0 ? '.55' : '1';
      }
    };

    const openCart = (trigger) => {
      clearTimeout(closeTimer);
      lastFocused = trigger || document.activeElement;
      colorModal.style.display = 'flex';
      colorModal.classList.remove('cart-closing');
      colorModal.classList.add('cart-open');
      document.body.classList.add('has-color-cart');
      closeButton?.focus({ preventScroll: true });
    };

    const closeCart = () => {
      colorModal.classList.remove('cart-open');
      colorModal.classList.add('cart-closing');
      document.body.classList.remove('has-color-cart');
      closeTimer = setTimeout(() => {
        colorModal.style.display = 'none';
        colorModal.classList.remove('cart-closing');
        lastFocused?.focus?.({ preventScroll: true });
      }, reduceMotion ? 20 : 230);
    };

    colorModal.style.display = 'none';
    colorModal.setAttribute('role', 'dialog');
    colorModal.setAttribute('aria-modal', 'true');
    colorModal.setAttribute('aria-label', 'Escolha as cores do Kit 10 Peças Colinox');
    closeButton?.addEventListener('click', closeCart);
    colorModal.addEventListener('click', (event) => { if (event.target === colorModal) closeCart(); });
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && colorModal.style.display !== 'none') closeCart();
    });

    variants.forEach((variant) => {
      variant.card.tabIndex = 0;
      variant.card.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        if (variant.qty === 0) variant.qty = 1;
        updateCart();
      });
      variant.card.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === variant.card) {
          event.preventDefault();
          if (variant.qty === 0) variant.qty = 1;
          updateCart();
        }
      });
      variant.plus.addEventListener('click', () => {
        variant.qty = Math.min(99, variant.qty + 1);
        updateCart();
      });
      variant.minus.addEventListener('click', () => {
        variant.qty = Math.max(0, variant.qty - 1);
        updateCart();
      });
    });

    const cartTriggers = $all('a, button').filter((element) => {
      const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`;
      return /comprar agora|adicionar\s*ao carrinho|carrinho/i.test(label) && !colorModal.contains(element);
    });
    cartTriggers.forEach((trigger) => {
      if (trigger.tagName === 'A') trigger.setAttribute('href', '#carrinho');
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openCart(trigger);
      });
    });

    cta?.removeAttribute('onclick');
    cta?.setAttribute('type', 'button');
    cta?.setAttribute('data-checkout-url', 'checkout.html');
    cta?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (cta.disabled) return;
      const items = variants
        .filter((variant) => variant.qty > 0)
        .map((variant) => ({
          name: variant.name,
          price: variant.price,
          qty: variant.qty,
          image: variant.image.getAttribute('src') || variant.image.src
        }));
      sessionStorage.setItem('colinoxCart', JSON.stringify({ items }));
      location.assign(new URL('checkout.html', location.href).href);
    }, true);

    updateCart();
  }

  const buyButton = $all('a').find((link) => /comprar agora/i.test(link.textContent));
  buyButton?.classList.add('motion-pulse');
})();

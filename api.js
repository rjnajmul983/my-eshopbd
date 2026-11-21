// E-ShopBD Storefront Core Library (API, Cart, Wishlist, Compare, Language BN/EN, Pixel & CAPI, Shared UI)

window.EShop = (function () {
  const LS_CART = 'eshopbd_cart_v1';
  const LS_WISH = 'eshopbd_wish_v1';
  const LS_COMP = 'eshopbd_comp_v1';
  const LS_LANG = 'eshopbd_lang_v1';
  const LS_TOKEN = 'eshopbd_user_token';
  const LS_SESSION = 'eshopbd_sess_id';

  let state = {
    settings: {},
    categories: [],
    lang: localStorage.getItem(LS_LANG) || 'bn'
  };

  const I18N = {
    bn: {
      search_placeholder: 'পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন...',
      search_btn: 'খুঁজুন',
      track_order: 'অর্ডার ট্র্যাক',
      account: 'অ্যাকাউন্ট',
      cart: 'কার্ট',
      add_cart: 'কার্টে যোগ',
      order_now: 'অর্ডার করুন',
      all_categories: 'সব ক্যাটাগরি',
      flash_sale: 'ফ্ল্যাশ সেল',
      featured: 'জনপ্রিয় প্রোডাক্ট',
      all_products: 'সকল প্রোডাক্ট',
      out_of_stock: 'স্টক শেষ',
      checkout: 'চেকআউট করুন',
      empty_cart: 'আপনার কার্টটি খালি!',
      subtotal: 'সাবটোটাল',
      free_delivery_unlocked: 'অভিনন্দন! আপনি ফ্রি ডেলিভারি আনলক করেছেন!',
      free_delivery_more: 'আর মাত্র ৳{diff} টাকার পণ্য যোগ করলে ডেলিভারি ফ্রি!'
    },
    en: {
      search_placeholder: 'Search products, brands or categories...',
      search_btn: 'Search',
      track_order: 'Track Order',
      account: 'Account',
      cart: 'Cart',
      add_cart: 'Add to Cart',
      order_now: 'Order Now',
      all_categories: 'All Categories',
      flash_sale: 'Flash Sale',
      featured: 'Featured Products',
      all_products: 'All Products',
      out_of_stock: 'Out of Stock',
      checkout: 'Proceed to Checkout',
      empty_cart: 'Your cart is empty!',
      subtotal: 'Subtotal',
      free_delivery_unlocked: 'Congrats! Free Delivery Unlocked!',
      free_delivery_more: 'Add ৳{diff} more to unlock FREE delivery!'
    }
  };

  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || key; }

  function getSessionId() {
    let s = localStorage.getItem(LS_SESSION);
    if (!s) {
      s = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(LS_SESSION, s);
    }
    return s;
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(LS_TOKEN);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api' + path, { ...options, headers });
    const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));
    return { status: res.status, ...data };
  }

  function toast(msg) {
    let el = document.getElementById('es-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'es-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // Cart Operations
  function getCart() { try { return JSON.parse(localStorage.getItem(LS_CART) || '[]'); } catch { return []; } }
  function saveCart(items) { localStorage.setItem(LS_CART, JSON.stringify(items)); updateBadges(); renderCartDrawer(); }

  function addToCart(product, qty = 1, variant = '') {
    const cart = getCart();
    const key = `${product.id}_${variant}`;
    const idx = cart.findIndex(i => `${i.id}_${i.variant || ''}` === key);
    const img = (product.images && product.images[0]) || product.image || '';
    if (idx >= 0) cart[idx].qty += qty;
    else cart.push({
      id: product.id, product_id: product.id, name: product.name, name_bn: product.name_bn || '',
      slug: product.slug, price: Number(product.sale_price || product.price), image: img,
      qty, variant, bulk_discount: product.bulk_discount || {}
    });
    saveCart(cart);
    trackEvent('AddToCart', { value: Number(product.sale_price || product.price) * qty, content_ids: [String(product.id)], num_items: qty });
    toast(state.lang === 'bn' ? 'কার্টে যোগ করা হয়েছে!' : 'Added to cart!');
  }

  function updateCartQty(index, delta) {
    const cart = getCart();
    if (!cart[index]) return;
    cart[index].qty += delta;
    if (cart[index].qty <= 0) cart.splice(index, 1);
    saveCart(cart);
  }

  function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
  }

  function clearCart() { saveCart([]); }

  // Wishlist & Compare
  function getWishlist() { try { return JSON.parse(localStorage.getItem(LS_WISH) || '[]'); } catch { return []; } }
  function toggleWishlist(prod) {
    let list = getWishlist();
    const exists = list.findIndex(p => p.id === prod.id);
    if (exists >= 0) { list.splice(exists, 1); toast('উইশলিস্ট থেকে সরানো হয়েছে'); }
    else { list.push({ id: prod.id, name: prod.name, name_bn: prod.name_bn, slug: prod.slug, sale_price: prod.sale_price, regular_price: prod.regular_price, image: (prod.images && prod.images[0]) || '' }); toast('উইশলিস্টে সেভ হয়েছে ❤️'); }
    localStorage.setItem(LS_WISH, JSON.stringify(list));
    updateBadges();
    return exists < 0;
  }

  function getCompare() { try { return JSON.parse(localStorage.getItem(LS_COMP) || '[]'); } catch { return []; } }
  function toggleCompare(prod) {
    let list = getCompare();
    const exists = list.findIndex(p => p.id === prod.id);
    if (exists >= 0) { list.splice(exists, 1); toast('কম্পেয়ার থেকে সরানো হয়েছে'); }
    else {
      if (list.length >= 3) { toast('সর্বোচ্চ ৩টি প্রোডাক্ট তুলনা করা যাবে'); return false; }
      list.push(prod);
      toast('কম্পেয়ার লিস্টে যোগ হয়েছে ⚖️');
    }
    localStorage.setItem(LS_COMP, JSON.stringify(list));
    updateBadges();
    return exists < 0;
  }

  // Tracking Pixels + Server-Side Facebook CAPI
  function injectTrackers(settings) {
    if (settings.primary_color) {
      document.documentElement.style.setProperty('--primary', settings.primary_color);
    }
    if (settings.fb_pixel_id && !window._fbqLoaded) {
      window._fbqLoaded = true;
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', settings.fb_pixel_id);
      window.fbq('track', 'PageView');
    }
    if (settings.gtm_id && !window._gtmLoaded) {
      window._gtmLoaded = true;
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(settings.gtm_id)}`;
      document.head.appendChild(s);
    }
  }

  function trackEvent(eventName, data = {}) {
    const eventId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (window.fbq) {
      try { window.fbq('track', eventName, { currency: 'BDT', value: data.value || 0, content_ids: data.content_ids || [], content_type: 'product' }, { eventID: eventId }); } catch {}
    }
    // Fire Server-Side CAPI via Cloudflare Worker
    fetch('/api/capi/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: eventName, event_id: eventId, url: location.href, ...data })
    }).catch(() => {});
  }

  function money(n) { return '৳' + Number(n || 0).toLocaleString('en-BD'); }
  function pName(p) { return (state.lang === 'bn' && p.name_bn) ? p.name_bn : p.name; }
  function cName(c) { return (state.lang === 'bn' && c.name_bn) ? c.name_bn : c.name; }

  function updateBadges() {
    const cartCount = getCart().reduce((a, b) => a + Number(b.qty || 1), 0);
    const wishCount = getWishlist().length;
    const compCount = getCompare().length;
    document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cartCount);
    document.querySelectorAll('[data-wish-count]').forEach(el => el.textContent = wishCount);
    document.querySelectorAll('[data-comp-count]').forEach(el => el.textContent = compCount);
  }

  function openCart() {
    renderCartDrawer();
    document.getElementById('es-drawer-bg')?.classList.add('open');
    document.getElementById('es-cart-drawer')?.classList.add('open');
  }
  function closeCart() {
    document.getElementById('es-drawer-bg')?.classList.remove('open');
    document.getElementById('es-cart-drawer')?.classList.remove('open');
  }

  function renderCartDrawer() {
    const body = document.getElementById('es-cart-items');
    const foot = document.getElementById('es-cart-foot');
    const shipEl = document.getElementById('es-free-ship');
    if (!body) return;
    const cart = getCart();
    const subtotal = cart.reduce((a, b) => a + Number(b.price) * Number(b.qty), 0);
    const thresh = Number(state.settings.free_delivery_threshold || 2000);

    if (shipEl && thresh > 0) {
      const pct = Math.min(100, Math.round((subtotal / thresh) * 100));
      const diff = Math.max(0, thresh - subtotal);
      shipEl.innerHTML = `
        <div>${diff === 0 ? '🎉 ' + t('free_delivery_unlocked') : '🚚 ' + t('free_delivery_more').replace('{diff}', diff)}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      `;
    }

    if (!cart.length) {
      body.innerHTML = `<div style="text-align:center;padding:42px 10px;color:var(--muted);"><div style="font-size:44px">🛒</div><p style="margin-top:8px;font-weight:600">${t('empty_cart')}</p></div>`;
      foot.innerHTML = `<a href="/" class="btn btn-primary btn-block">শপিং শুরু করুন</a>`;
      return;
    }

    body.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <img src="${item.image || 'https://placehold.co/100x100?text=No+Img'}" alt="">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700;line-height:1.3">${pName(item)}</div>
          ${item.variant ? `<div style="font-size:11.5px;color:var(--muted)">${item.variant}</div>` : ''}
          <div style="color:var(--primary);font-weight:800;margin:4px 0">${money(item.price)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div class="qty-ctrl">
              <button onclick="EShop.updateCartQty(${idx}, -1)">-</button>
              <span>${item.qty}</span>
              <button onclick="EShop.updateCartQty(${idx}, 1)">+</button>
            </div>
            <button onclick="EShop.removeFromCart(${idx})" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:12px">মুছুন</button>
          </div>
        </div>
      </div>
    `).join('');

    foot.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-bottom:10px">
        <span>${t('subtotal')}</span><span>${money(subtotal)}</span>
      </div>
      <a href="/checkout.html" class="btn btn-primary btn-block btn-lg">${t('checkout')} →</a>
    `;
  }

  function openWishlistModal() {
    const list = getWishlist();
    showModal('❤️ উইশলিস্ট (' + list.length + ')', list.length ? `
      <div style="display:grid;gap:10px">
        ${list.map(p => `
          <div style="display:flex;align-items:center;gap:12px;border:1px solid var(--border);padding:10px;border-radius:10px">
            <img src="${p.image || 'https://placehold.co/80'}" style="width:56px;height:56px;border-radius:8px;object-fit:cover">
            <div style="flex:1">
              <a href="/product.html?slug=${encodeURIComponent(p.slug)}" style="font-weight:700">${pName(p)}</a>
              <div style="color:var(--primary);font-weight:800">${money(p.sale_price)}</div>
            </div>
            <a href="/product.html?slug=${encodeURIComponent(p.slug)}" class="btn btn-primary btn-sm">দেখুন</a>
          </div>
        `).join('')}
      </div>
    ` : '<p style="color:var(--muted);text-align:center;padding:24px">উইশলিস্টে কোনো পণ্য নেই।</p>');
  }

  function openCompareModal() {
    const list = getCompare();
    if (!list.length) {
      showModal('⚖️ প্রোডাক্ট কম্পেয়ার', '<p style="color:var(--muted);text-align:center;padding:24px">তুলনা করার জন্য প্রোডাক্ট কার্ডের ⚖️ আইকনে ক্লিক করুন (সর্বোচ্চ ৩টি)।</p>');
      return;
    }
    showModal('⚖️ প্রোডাক্ট তুলনা (' + list.length + ')', `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13.5px">
          <tr>
            <th style="text-align:left;padding:8px;border:1px solid var(--border)">বৈশিষ্ট্য</th>
            ${list.map(p => `<th style="padding:8px;border:1px solid var(--border)"><img src="${(p.images && p.images[0]) || ''}" style="width:70px;height:70px;object-fit:cover;margin:0 auto 6px;border-radius:8px"><a href="/product.html?slug=${p.slug}">${pName(p)}</a></th>`).join('')}
          </tr>
          <tr><td style="padding:8px;border:1px solid var(--border);font-weight:700">দাম</td>${list.map(p => `<td style="padding:8px;border:1px solid var(--border);text-align:center;color:var(--primary);font-weight:800">${money(p.sale_price)}</td>`).join('')}</tr>
          <tr><td style="padding:8px;border:1px solid var(--border);font-weight:700">ব্র্যান্ড</td>${list.map(p => `<td style="padding:8px;border:1px solid var(--border);text-align:center">${p.brand || '-'}</td>`).join('')}</tr>
          <tr><td style="padding:8px;border:1px solid var(--border);font-weight:700">স্টক</td>${list.map(p => `<td style="padding:8px;border:1px solid var(--border);text-align:center">${p.stock > 0 ? 'In Stock ('+p.stock+')' : 'Out'}</td>`).join('')}</tr>
          <tr><td style="padding:8px;border:1px solid var(--border);font-weight:700">রেটিং</td>${list.map(p => `<td style="padding:8px;border:1px solid var(--border);text-align:center">⭐ ${p.rating_avg || 5}</td>`).join('')}</tr>
        </table>
      </div>
      <div style="margin-top:12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="localStorage.removeItem('eshopbd_comp_v1');EShop.updateBadges();EShop.closeModal()">লিস্ট ক্লিয়ার করুন</button></div>
    `);
  }

  function showModal(title, html) {
    let m = document.getElementById('es-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'es-modal';
      m.className = 'modal-overlay';
      m.innerHTML = `<div class="modal-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 id="es-modal-title"></h3><button onclick="EShop.closeModal()" style="border:none;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px">×</button></div><div id="es-modal-body"></div></div>`;
      m.addEventListener('click', e => { if (e.target === m) closeModal(); });
      document.body.appendChild(m);
    }
    document.getElementById('es-modal-title').textContent = title;
    document.getElementById('es-modal-body').innerHTML = html;
    m.classList.add('open');
  }
  function closeModal() { document.getElementById('es-modal')?.classList.remove('open'); }

  function toggleLang() {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    localStorage.setItem(LS_LANG, state.lang);
    location.reload();
  }

  function renderProductCard(p) {
    const img = (p.images && p.images[0]) || 'https://placehold.co/400x400?text=Product';
    const wishActive = getWishlist().some(w => w.id === p.id) ? 'active' : '';
    const compActive = getCompare().some(c => c.id === p.id) ? 'active' : '';
    const safeProd = encodeURIComponent(JSON.stringify({
      id: p.id, name: p.name, name_bn: p.name_bn, slug: p.slug, sale_price: p.sale_price,
      regular_price: p.regular_price, images: p.images, brand: p.brand, stock: p.stock, rating_avg: p.rating_avg, bulk_discount: p.bulk_discount
    }));
    return `
      <div class="product-card">
        <div class="p-img-wrap">
          <a href="/product.html?slug=${encodeURIComponent(p.slug)}">
            <img src="${img}" alt="${p.name}" loading="lazy">
          </a>
          ${p.discount_percent > 0 ? `<span class="p-badge">-${p.discount_percent}%</span>` : ''}
          ${p.stock <= 0 ? `<div class="p-stock-out">${t('out_of_stock')}</div>` : ''}
          <div class="p-float-actions">
            <button class="p-float-btn ${wishActive}" title="Wishlist" onclick="EShop.handleWishBtn(this, '${safeProd}')">♥</button>
            <button class="p-float-btn ${compActive}" title="Compare" onclick="EShop.handleCompBtn(this, '${safeProd}')">⚖</button>
          </div>
        </div>
        <div class="p-body">
          <a href="/product.html?slug=${encodeURIComponent(p.slug)}" class="p-title">${pName(p)}</a>
          <div class="p-meta">
            <span>⭐ ${p.rating_avg || 5.0} (${p.review_count || 0})</span>
            <span>বিক্রি ${p.sold_count || 0}+</span>
          </div>
          <div class="p-price-row">
            <span class="p-sale">${money(p.sale_price)}</span>
            ${p.regular_price > p.sale_price ? `<span class="p-reg">${money(p.regular_price)}</span>` : ''}
          </div>
          <div class="p-btns">
            <button class="btn btn-outline btn-sm" ${p.stock <= 0 ? 'disabled' : ''} onclick="EShop.addToCart(JSON.parse(decodeURIComponent('${safeProd}')))">🛒 ${t('add_cart')}</button>
            <button class="btn btn-primary btn-sm" ${p.stock <= 0 ? 'disabled' : ''} onclick="EShop.quickOrder('${safeProd}')">⚡ ${t('order_now')}</button>
          </div>
        </div>
      </div>
    `;
  }

  function handleWishBtn(btn, encoded) {
    const added = toggleWishlist(JSON.parse(decodeURIComponent(encoded)));
    btn.classList.toggle('active', added);
  }
  function handleCompBtn(btn, encoded) {
    const added = toggleCompare(JSON.parse(decodeURIComponent(encoded)));
    btn.classList.toggle('active', added);
  }
  function quickOrder(encoded) {
    const prod = JSON.parse(decodeURIComponent(encoded));
    addToCart(prod, 1);
    location.href = '/checkout.html';
  }

  // Render Shared Layout (Header, Cart Drawer, Footer, Mobile Nav, Live Search)
  async function mountLayout(preloadedSettings = null, preloadedCategories = null) {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    if (preloadedSettings) {
      state.settings = preloadedSettings;
      state.categories = preloadedCategories || [];
    } else {
      const [sRes, cRes] = await Promise.all([api('/settings'), api('/categories')]);
      if (sRes.ok) state.settings = sRes.settings;
      if (cRes.ok) state.categories = cRes.categories;
    }

    const s = state.settings;
    injectTrackers(s);

    const headerMount = document.getElementById('site-header-mount');
    if (headerMount) {
      headerMount.innerHTML = `
        <div class="top-bar">
          <div class="container top-bar-inner">
            <div>${s.announcement_text || '🎉 সারা বাংলাদেশে দ্রুত ক্যাশ অন ডেলিভারি!'}</div>
            <div class="top-bar-links">
              <a href="tel:${s.helpline_phone || ''}">📞 ${s.helpline_phone || '01700000000'}</a>
              <a href="/track.html">📦 ${t('track_order')}</a>
              <a href="/admin/" style="opacity:.85">⚙️ Admin</a>
              <button class="lang-btn" onclick="EShop.toggleLang()">${state.lang === 'bn' ? 'EN' : 'বাংলা'}</button>
            </div>
          </div>
        </div>
        <header class="site-header">
          <div class="container header-main">
            <a href="/" class="brand-logo">
              ${s.logo_url ? `<img src="${s.logo_url}" alt="${s.site_name}">` : `<span class="brand-badge">${(s.site_name || 'E')[0]}</span>`}
              <span>${s.site_name || 'E-ShopBD'}</span>
            </a>
            <div class="search-wrap">
              <form class="search-box" onsubmit="event.preventDefault(); location.href='/?q='+encodeURIComponent(document.getElementById('es-search-inp').value)">
                <input id="es-search-inp" type="search" placeholder="${t('search_placeholder')}" autocomplete="off">
                <button type="submit">${t('search_btn')}</button>
              </form>
              <div id="es-search-drop" class="search-dropdown"></div>
            </div>
            <div class="header-actions">
              <button class="icon-btn hide-sm" onclick="EShop.openWishlistModal()" title="Wishlist">❤️ <span class="badge-count" data-wish-count>0</span></button>
              <button class="icon-btn hide-sm" onclick="EShop.openCompareModal()" title="Compare">⚖️ <span class="badge-count" data-comp-count>0</span></button>
              <a href="/account.html" class="icon-btn hide-sm">👤 ${t('account')}</a>
              <button class="icon-btn primary" onclick="EShop.openCart()">🛒 <span class="hide-sm">${t('cart')}</span> <span class="badge-count" data-cart-count>0</span></button>
            </div>
          </div>
          <nav class="cat-nav">
            <div class="container cat-nav-list">
              <a href="/" class="cat-pill">${t('all_categories')}</a>
              <a href="/?flash=1" class="cat-pill">⚡ ${t('flash_sale')}</a>
              ${state.categories.map(c => `<a href="/?category=${encodeURIComponent(c.slug)}" class="cat-pill">${c.icon || ''} ${cName(c)}</a>`).join('')}
            </div>
          </nav>
        </header>
      `;

      // Live search suggestions
      const inp = document.getElementById('es-search-inp');
      const drop = document.getElementById('es-search-drop');
      let st;
      inp?.addEventListener('input', () => {
        clearTimeout(st);
        const q = inp.value.trim();
        if (q.length < 2) { drop.classList.remove('open'); return; }
        st = setTimeout(async () => {
          const r = await api('/products?limit=6&q=' + encodeURIComponent(q));
          if (r.ok && r.products.length) {
            drop.innerHTML = r.products.map(p => `
              <a class="search-item" href="/product.html?slug=${encodeURIComponent(p.slug)}">
                <img src="${(p.images && p.images[0]) || ''}" alt="">
                <div style="flex:1">
                  <div style="font-size:13.5px;font-weight:700">${pName(p)}</div>
                  <div style="font-size:12.5px;color:var(--primary);font-weight:800">${money(p.sale_price)}</div>
                </div>
              </a>
            `).join('');
            drop.classList.add('open');
          } else {
            drop.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:13px">কোনো প্রোডাক্ট পাওয়া যায়নি</div>';
            drop.classList.add('open');
          }
        }, 280);
      });
      document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) drop?.classList.remove('open'); });
    }

    // Cart Drawer & Mobile Bottom Nav & Floating WhatsApp
    if (!document.getElementById('es-cart-drawer')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="es-drawer-bg" class="drawer-backdrop" onclick="EShop.closeCart()"></div>
        <aside id="es-cart-drawer" class="cart-drawer">
          <div class="drawer-head">
            <h3>🛒 শপিং কার্ট</h3>
            <button onclick="EShop.closeCart()" style="border:none;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px">×</button>
          </div>
          <div id="es-free-ship" class="free-ship-bar"></div>
          <div id="es-cart-items" class="drawer-body"></div>
          <div id="es-cart-foot" class="drawer-foot"></div>
        </aside>
        ${s.whatsapp_number ? `<a class="wa-float" target="_blank" href="https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি অর্ডার সম্পর্কে জানতে চাই।')}" title="WhatsApp">💬</a>` : ''}
        <nav class="mobile-nav">
          <div class="mobile-nav-grid">
            <a href="/"><span class="m-ico">🏠</span>হোম</a>
            <a href="/?flash=1"><span class="m-ico">⚡</span>অফার</a>
            <button onclick="EShop.openCart()"><span class="m-ico">🛒</span>কার্ট <span class="badge-count" style="top:0;right:14px" data-cart-count>0</span></button>
            <a href="/track.html"><span class="m-ico">📦</span>ট্র্যাক</a>
            <a href="/account.html"><span class="m-ico">👤</span>অ্যাকাউন্ট</a>
          </div>
        </nav>
      `);
    }

    const footerMount = document.getElementById('site-footer-mount');
    if (footerMount) {
      footerMount.innerHTML = `
        <footer class="site-footer">
          <div class="container">
            <div class="footer-grid">
              <div>
                <h4 style="font-size:20px">${s.site_name || 'E-ShopBD'}</h4>
                <p style="margin-bottom:10px">${s.site_tagline || ''}</p>
                <p>📍 ${s.shop_address || ''}</p>
                <p>📞 ${s.helpline_phone || ''}</p>
                <p>✉️ ${s.shop_email || ''}</p>
              </div>
              <div>
                <h4>কাস্টমার কেয়ার</h4>
                <ul>
                  <li><a href="/track.html">অর্ডার ট্র্যাকিং</a></li>
                  <li><a href="/account.html">আমার অ্যাকাউন্ট ও পয়েন্ট</a></li>
                  <li><a href="/page.html?slug=return-policy">রিটার্ন ও রিফান্ড পলিসি</a></li>
                  <li><a href="/page.html?slug=contact">যোগাযোগ ও শোরুম</a></li>
                </ul>
              </div>
              <div>
                <h4>গুরুত্বপূর্ণ লিংক</h4>
                <ul>
                  <li><a href="/page.html?slug=about-us">আমাদের সম্পর্কে</a></li>
                  <li><a href="/page.html?slug=privacy-policy">প্রাইভেসি পলিসি</a></li>
                  <li><a href="/page.html?slug=terms">শর্তাবলী</a></li>
                  <li><a href="/admin/">অ্যাডমিন প্যানেল</a></li>
                </ul>
              </div>
              <div>
                <h4>পেমেন্ট ও ডেলিভারি</h4>
                <p>✅ সারা বাংলাদেশে ক্যাশ অন ডেলিভারি</p>
                <p>💳 bKash / Nagad / Rocket</p>
                <p>🚚 Steadfast / Pathao / RedX পার্টনার</p>
              </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;text-align:center;font-size:12.5px">
              © ${new Date().getFullYear()} ${s.site_name || 'E-ShopBD'}. All rights reserved. Powered by Cloudflare Edge.
            </div>
          </div>
        </footer>
      `;
    }
    updateBadges();
    return state;
  }

  return {
    api, t, state, toast, money, pName, cName, getSessionId,
    getCart, addToCart, updateCartQty, removeFromCart, clearCart,
    getWishlist, toggleWishlist, getCompare, toggleCompare,
    openCart, closeCart, openWishlistModal, openCompareModal, showModal, closeModal,
    toggleLang, trackEvent, renderProductCard, handleWishBtn, handleCompBtn, quickOrder,
    mountLayout, updateBadges
  };
})();

let sliderIdx = 0;
let sliderTimer;

async function initStore() {
  const boot = await EShop.api('/store/bootstrap');
  if (!boot.ok) {
    if (boot.needs_setup) {
      document.getElementById('setup-alert').style.display = 'block';
    }
    return;
  }

  await EShop.mountLayout(boot.settings, boot.categories);
  document.title = `${boot.settings.site_name} — ${boot.settings.site_tagline || 'অনলাইন শপ'}`;
  EShop.trackEvent('PageView');

  // Fill filter dropdowns
  const fCat = document.getElementById('f-cat');
  boot.categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.slug;
    opt.textContent = EShop.cName(c);
    fCat.appendChild(opt);
  });

  const params = new URLSearchParams(location.search);
  const hasFilter = params.get('q') || params.get('category') || params.get('flash') || params.get('cat');

  if (!hasFilter) {
    renderHero(boot.banners);
    renderCategories(boot.categories);
    if (boot.flash_sale && boot.flash_sale.length) {
      document.getElementById('flash-section').style.display = 'block';
      document.getElementById('flash-grid').innerHTML = boot.flash_sale.map(EShop.renderProductCard).join('');
      startCountdown(boot.settings.flash_sale_end);
    }
  } else {
    document.getElementById('hero-wrap').style.display = 'none';
    document.getElementById('cat-section').style.display = 'none';
    if (params.get('category') || params.get('cat')) fCat.value = params.get('category') || params.get('cat');
    if (params.get('q')) {
      document.getElementById('shop-heading').textContent = `🔍 "${params.get('q')}" এর ফলাফল`;
      const sInp = document.getElementById('es-search-inp');
      if (sInp) sInp.value = params.get('q');
    }
    if (params.get('flash') === '1') {
      document.getElementById('shop-heading').textContent = '⚡ ফ্ল্যাশ সেল অফার';
    }
  }

  await loadFilteredProducts(params.get('q') || '', params.get('flash') === '1');
}

function renderHero(banners) {
  const wrap = document.getElementById('hero-wrap');
  if (!banners || !banners.length) { wrap.style.display = 'none'; return; }
  wrap.innerHTML = `
    <div class="hero-slider">
      ${banners.map((b, i) => `
        <div class="hero-slide ${i === 0 ? 'active' : ''}">
          <img src="${b.image}" alt="${b.title}">
          <div class="hero-content">
            <h1>${b.title}</h1>
            <p>${b.subtitle || ''}</p>
            <a href="${b.link || '#shop-section'}" class="btn btn-primary btn-lg">এখনই শপিং করুন →</a>
          </div>
        </div>
      `).join('')}
      <div class="hero-dots">
        ${banners.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" onclick="goSlide(${i})"></button>`).join('')}
      </div>
    </div>
  `;
  if (banners.length > 1) {
    sliderTimer = setInterval(() => goSlide((sliderIdx + 1) % banners.length), 5000);
  }
}

window.goSlide = function(idx) {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot');
  if (!slides.length) return;
  sliderIdx = idx;
  slides.forEach((s, i) => s.classList.toggle('active', i === idx));
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
};

function renderCategories(cats) {
  document.getElementById('cat-grid').innerHTML = cats.map(c => `
    <a href="/?category=${encodeURIComponent(c.slug)}" class="cat-card">
      ${c.image ? `<img src="${c.image}" alt="${c.name}" loading="lazy">` : `<div style="font-size:34px;margin-bottom:6px">${c.icon || '📦'}</div>`}
      <div class="cat-name">${EShop.cName(c)}</div>
    </a>
  `).join('');
}

function startCountdown(endIso) {
  const el = document.getElementById('flash-countdown');
  if (!el) return;
  const end = new Date(endIso || Date.now() + 86400000).getTime();
  function tick() {
    const diff = Math.max(0, end - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${d}d : ${String(h).padStart(2,'0')}h : ${String(m).padStart(2,'0')}m : ${String(s).padStart(2,'0')}s`;
  }
  tick();
  setInterval(tick, 1000);
}

async function loadFilteredProducts(q = '', flashOnly = false) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (flashOnly) qs.set('flash', '1');
  const cat = document.getElementById('f-cat').value;
  const brand = document.getElementById('f-brand').value;
  const minP = document.getElementById('f-min').value;
  const maxP = document.getElementById('f-max').value;
  const inStock = document.getElementById('f-stock').checked;
  const sort = document.getElementById('f-sort').value;

  if (cat) qs.set('category', cat);
  if (brand) qs.set('brand', brand);
  if (minP) qs.set('min_price', minP);
  if (maxP) qs.set('max_price', maxP);
  if (inStock) qs.set('in_stock', '1');
  if (sort) qs.set('sort', sort);

  const res = await EShop.api('/products?' + qs.toString());
  const grid = document.getElementById('products-grid');
  if (!res.ok) { grid.innerHTML = '<p>লোড করতে সমস্যা হয়েছে।</p>'; return; }

  const brandSel = document.getElementById('f-brand');
  if (brandSel.options.length <= 1 && res.brands) {
    res.brands.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      brandSel.appendChild(opt);
    });
  }

  document.getElementById('result-count').textContent = `মোট ${res.total}টি প্রোডাক্ট`;
  grid.innerHTML = res.products.length
    ? res.products.map(EShop.renderProductCard).join('')
    : '<div class="card" style="grid-column:1/-1;text-align:center;padding:36px">কোনো প্রোডাক্ট পাওয়া যায়নি। অন্য ক্যাটাগরি বা ফিল্টার চেষ্টা করুন।</div>';
}

window.applyFilters = () => {
  const params = new URLSearchParams(location.search);
  loadFilteredProducts(params.get('q') || '', params.get('flash') === '1');
};

initStore();

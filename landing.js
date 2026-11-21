async function initLanding() {
  const [sRes] = await Promise.all([EShop.api('/settings')]);
  const s = sRes.settings || {};
  EShop.state.settings = s;
  if (s.primary_color) document.documentElement.style.setProperty('--primary', s.primary_color);

  const slug = new URLSearchParams(location.search).get('slug');
  const res = await EShop.api(slug ? '/products/' + encodeURIComponent(slug) : '/products?limit=1');
  const p = res.product || (res.products && res.products[0]);
  if (!p) { document.getElementById('lp-root').innerHTML = '<div class="container" style="padding:40px">প্রোডাক্ট পাওয়া যায়নি।</div>'; return; }

  document.title = p.landing_content?.headline || EShop.pName(p);
  EShop.trackEvent('ViewContent', { value: p.sale_price, content_ids: [String(p.id)] });

  const lc = p.landing_content || {};
  const imgs = p.images || [];
  const bullets = lc.bullets && lc.bullets.length ? lc.bullets : ['১০০% অরিজিনাল ও কোয়ালিটি গ্যারান্টি', 'অগ্রিম ১ টাকাও দিতে হবে না — ক্যাশ অন ডেলিভারি', 'ডেলিভারি ম্যানের সামনে চেক করে নেওয়ার সুবিধা'];

  document.getElementById('lp-root').innerHTML = `
    <section class="lp-hero">
      <div class="lp-box">
        <span class="p-badge" style="position:static;font-size:13px;padding:4px 12px">🔥 সীমিত সময়ের স্পেশাল অফার</span>
        <h1 style="font-size:clamp(22px,4vw,34px);margin:14px 0">${lc.headline || EShop.pName(p)}</h1>
        <p style="opacity:.9;margin-bottom:18px">${p.short_desc || ''}</p>
        <a href="#lp-order" class="btn btn-primary btn-lg">👇 এখনই অর্ডার করুন — ${EShop.money(p.sale_price)}</a>
      </div>
    </section>

    <div class="lp-box" style="margin-top:24px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:20px">
        ${imgs.map(im => `<img src="${im}" style="border-radius:14px;width:100%;aspect-ratio:1/1;object-fit:cover;box-shadow:var(--shadow)">`).join('')}
      </div>

      <div class="card" style="margin-bottom:20px">
        <h2>কেন এই প্রোডাক্টটি আপনার নেওয়া উচিত?</h2>
        <ul class="lp-bullets">${bullets.map(b => `<li>✅ ${b}</li>`).join('')}</ul>
        <div style="background:#fff1f2;padding:16px;border-radius:12px;text-align:center">
          <div style="font-size:16px;color:var(--muted)">রেগুলার মূল্য: <del>${EShop.money(p.regular_price)}</del></div>
          <div style="font-size:30px;font-weight:800;color:var(--primary)">অফার মূল্য মাত্র: ${EShop.money(p.sale_price)}</div>
          ${lc.offer_note ? `<div style="margin-top:6px;font-weight:700;color:#9f1239">${lc.offer_note}</div>` : ''}
        </div>
      </div>

      <form id="lp-order" class="card" style="border:2px solid var(--primary)">
        <h2 style="text-align:center;margin-bottom:14px">📦 অর্ডার করতে নিচের ফর্মটি পূরণ করুন</h2>
        <div class="form-group"><label>আপনার নাম *</label><input id="lp-name" class="form-control" required></div>
        <div class="form-group"><label>মোবাইল নম্বর (১১ ডিজিট) *</label><input id="lp-phone" class="form-control" pattern="01[0-9]{9}" placeholder="01XXXXXXXXX" required></div>
        <div class="form-group"><label>সম্পূর্ণ ঠিকানা *</label><textarea id="lp-addr" class="form-control" rows="2" required></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label>পরিমাণ:</label>
            <select id="lp-qty" class="form-control"><option value="1">১ পিস</option><option value="2">২ পিস (স্পেশাল ছাড়)</option><option value="3">৩ পিস</option></select>
          </div>
          <div class="form-group">
            <label>ডেলিভারি এরিয়া:</label>
            <select id="lp-zone" class="form-control">
              <option value="inside_dhaka">ঢাকা সিটি (${EShop.money(s.delivery_inside_dhaka || 60)})</option>
              <option value="outside_dhaka">ঢাকার বাইরে (${EShop.money(s.delivery_outside_dhaka || 120)})</option>
            </select>
          </div>
        </div>
        <button id="lp-btn" type="submit" class="btn btn-primary btn-lg btn-block">✅ অর্ডার কনফার্ম করুন (ক্যাশ অন ডেলিভারি)</button>
      </form>
    </div>
  `;

  // Auto-capture incomplete lead on landing page too!
  let tm;
  document.getElementById('lp-phone').addEventListener('input', () => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const ph = document.getElementById('lp-phone').value.replace(/[^0-9]/g, '');
      if (ph.length >= 11) {
        EShop.api('/incomplete-orders', {
          method: 'POST',
          body: JSON.stringify({
            session_id: EShop.getSessionId(), customer_name: document.getElementById('lp-name').value,
            customer_phone: ph, customer_address: document.getElementById('lp-addr').value,
            items: [{ id: p.id, product_id: p.id, name: p.name, price: p.sale_price, qty: Number(document.getElementById('lp-qty').value) }],
            subtotal: p.sale_price
          })
        });
      }
    }, 1200);
  });

  document.getElementById('lp-order').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('lp-btn');
    btn.disabled = true; btn.textContent = 'অর্ডার হচ্ছে...';
    const qty = Number(document.getElementById('lp-qty').value);
    const res = await EShop.api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        session_id: EShop.getSessionId(),
        customer_name: document.getElementById('lp-name').value,
        customer_phone: document.getElementById('lp-phone').value,
        customer_address: document.getElementById('lp-addr').value,
        delivery_zone: document.getElementById('lp-zone').value,
        payment_method: 'cod',
        source: 'landing',
        items: [{ product_id: p.id, qty }]
      })
    });
    if (res.ok) {
      document.getElementById('lp-order').innerHTML = `<div style="text-align:center;padding:20px"><div style="font-size:48px">🎉</div><h2 style="color:var(--success)">ধন্যবাদ! আপনার অর্ডার #${res.order.order_number} কনফার্ম হয়েছে।</h2><p>মোট বিল: ${EShop.money(res.order.total_amount)}</p><a href="/track.html?q=${res.order.order_number}" class="btn btn-primary" style="margin-top:12px">অর্ডার ট্র্যাক করুন</a></div>`;
    } else {
      EShop.toast(res.error || 'Error');
      btn.disabled = false; btn.textContent = '✅ অর্ডার কনফার্ম করুন';
    }
  });
}
initLanding();

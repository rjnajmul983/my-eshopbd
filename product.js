let currentProduct = null;
let selectedColor = '';
let selectedSize = '';
let qty = 1;

async function initProduct() {
  await EShop.mountLayout();
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) { location.href = '/'; return; }

  const res = await EShop.api('/products/' + encodeURIComponent(slug));
  const root = document.getElementById('pdp-root');
  if (!res.ok) { root.innerHTML = '<div class="card"><h3>প্রোডাক্টটি পাওয়া যায়নি।</h3><a href="/" class="btn btn-primary" style="margin-top:12px">হোমে ফিরুন</a></div>'; return; }

  const p = res.product;
  currentProduct = p;
  document.title = `${EShop.pName(p)} — ${EShop.state.settings.site_name || 'E-ShopBD'}`;
  EShop.trackEvent('ViewContent', { value: p.sale_price, content_ids: [String(p.id)] });

  const imgs = p.images && p.images.length ? p.images : ['https://placehold.co/600x600?text=No+Image'];
  const colors = (p.variants && p.variants.colors) || [];
  const sizes = (p.variants && p.variants.sizes) || [];
  if (colors.length) selectedColor = colors[0];
  if (sizes.length) selectedSize = sizes[0];

  const savings = Math.max(0, p.regular_price - p.sale_price);
  const waNum = EShop.state.settings.whatsapp_number || '';
  const phone = EShop.state.settings.helpline_phone || '';
  const shareUrl = `${location.origin}/p/${encodeURIComponent(p.slug)}`;

  root.innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px">
      <a href="/">হোম</a> / <a href="/?category=${encodeURIComponent(p.category_slug || '')}">${p.category_name || 'প্রোডাক্ট'}</a> / ${EShop.pName(p)}
    </div>
    <div class="pdp-grid">
      <div>
        <div class="gallery-main"><img id="main-img" src="${imgs[0]}" alt="${p.name}"></div>
        <div class="gallery-thumbs">
          ${imgs.map((im, i) => `<img src="${im}" class="${i===0?'active':''}" onclick="switchImg(this,'${im}')">`).join('')}
        </div>
        ${p.video_url ? `<div class="card" style="margin-top:12px"><strong>🎥 প্রোডাক্ট ভিডিও:</strong> <a href="${p.video_url}" target="_blank" style="color:var(--primary);text-decoration:underline">ভিডিও দেখুন ↗</a></div>` : ''}
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--muted)">SKU: ${p.sku || 'N/A'} | ব্র্যান্ড: ${p.brand || 'Original'}</span>
          <span style="font-size:13px;font-weight:700;color:${p.stock > 0 ? 'var(--success)' : 'var(--danger)'}">${p.stock > 0 ? `✅ স্টকে আছে (${p.stock})` : '❌ স্টক শেষ'}</span>
        </div>
        <h1 style="font-size:23px;margin:8px 0">${EShop.pName(p)}</h1>
        <div style="font-size:13.5px;color:var(--muted);margin-bottom:12px">⭐ ${p.rating_avg || 5.0} (${p.review_count || 0} রিভিউ) • বিক্রি হয়েছে ${p.sold_count || 0}+ পিস</div>

        <div style="background:#fff1f2;padding:12px 14px;border-radius:10px;display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
          <span style="font-size:28px;font-weight:800;color:var(--primary)">${EShop.money(p.sale_price)}</span>
          ${savings > 0 ? `<span style="font-size:16px;text-decoration:line-through;color:var(--muted)">${EShop.money(p.regular_price)}</span><span class="p-badge" style="position:static">সাশ্রয় ${EShop.money(savings)}</span>` : ''}
        </div>

        ${p.bulk_discount && p.bulk_discount.min_qty ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;margin-bottom:14px">
            🎁 কম্বো অফার: একসাথে ${p.bulk_discount.min_qty}টি বা তার বেশি অর্ডার করলে অতিরিক্ত ${EShop.money(p.bulk_discount.discount_amount)} ছাড়!
          </div>` : ''}

        ${colors.length ? `
          <div class="form-group">
            <label>কালার নির্বাচন করুন:</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="color-chips">
              ${colors.map((c,i) => `<button class="variant-chip ${i===0?'active':''}" onclick="pickColor(this,'${c}')">${c}</button>`).join('')}
            </div>
          </div>` : ''}

        ${sizes.length ? `
          <div class="form-group">
            <label>সাইজ নির্বাচন করুন:</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="size-chips">
              ${sizes.map((s,i) => `<button class="variant-chip ${i===0?'active':''}" onclick="pickSize(this,'${s}')">${s}</button>`).join('')}
            </div>
          </div>` : ''}

        <div class="form-group" style="display:flex;align-items:center;gap:14px">
          <label style="margin:0">পরিমাণ:</label>
          <div class="qty-ctrl">
            <button onclick="chgQty(-1)">-</button>
            <span id="pdp-qty">1</span>
            <button onclick="chgQty(1)">+</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0">
          <button class="btn btn-primary btn-lg" ${p.stock<=0?'disabled':''} onclick="buyNow()">⚡ এখনই অর্ডার করুন</button>
          <button class="btn btn-dark btn-lg" ${p.stock<=0?'disabled':''} onclick="addCurrent()">🛒 কার্টে যোগ করুন</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
          ${waNum ? `<a class="btn btn-whatsapp btn-sm" target="_blank" href="https://wa.me/${waNum}?text=${encodeURIComponent('আমি এই প্রোডাক্টটি অর্ডার করতে চাই: '+p.name+' - '+shareUrl)}">💬 WhatsApp</a>` : ''}
          ${phone ? `<a class="btn btn-outline btn-sm" href="tel:${phone}">📞 কল করুন</a>` : ''}
          <button class="btn btn-outline btn-sm" onclick="navigator.clipboard?.writeText('${shareUrl}');EShop.toast('শেয়ার লিংক কপি হয়েছে!')">🔗 শেয়ার লিংক</button>
        </div>

        <a href="/landing.html?slug=${encodeURIComponent(p.slug)}" style="font-size:12.5px;color:var(--muted);text-decoration:underline">🎯 স্পেশাল অফার ল্যান্ডিং পেজ দেখুন</a>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);font-size:13.5px;color:var(--muted)">
          <div>🚚 ঢাকা সিটিতে ডেলিভারি চার্জ: ${EShop.money(EShop.state.settings.delivery_inside_dhaka || 60)} | ঢাকার বাইরে: ${EShop.money(EShop.state.settings.delivery_outside_dhaka || 120)}</div>
          <div>💵 ক্যাশ অন ডেলিভারি ও চেক করে নেওয়ার নিশ্চয়তা</div>
        </div>
      </div>
    </div>

    <!-- Description, Specs & Reviews -->
    <div class="pdp-grid" style="margin-top:22px">
      <div class="card">
        <h3 style="margin-bottom:10px">📝 পণ্যের বিবরণ</h3>
        <div style="font-size:14.5px;line-height:1.7">${p.description || p.short_desc || ''}</div>
        ${(p.specs && p.specs.length) ? `
          <h3 style="margin:20px 0 10px">⚙️ স্পেসিফিকেশন</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13.5px">
            ${p.specs.map(sp => `<tr><td style="padding:8px;border:1px solid var(--border);background:#f8fafc;font-weight:700;width:40%">${sp.key}</td><td style="padding:8px;border:1px solid var(--border)">${sp.value}</td></tr>`).join('')}
          </table>` : ''}
      </div>

      <div class="card">
        <h3 style="margin-bottom:12px">⭐ কাস্টমার রিভিউ (${res.reviews.length})</h3>
        <div id="reviews-list" style="display:grid;gap:10px;margin-bottom:18px">
          ${res.reviews.length ? res.reviews.map(r => `
            <div style="border:1px solid var(--border);border-radius:10px;padding:11px">
              <div style="display:flex;justify-content:space-between;font-size:13px">
                <strong>${r.customer_name}</strong>
                <span style="color:#f59e0b">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
              </div>
              <p style="font-size:13.5px;margin-top:5px">${r.comment}</p>
              ${r.image ? `<img src="${r.image}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;margin-top:8px">` : ''}
            </div>
          `).join('') : '<p style="color:var(--muted);font-size:13.5px">এখনও কোনো রিভিউ নেই। প্রথম রিভিউ দিন!</p>'}
        </div>

        <form id="review-form" style="border-top:1px solid var(--border);padding-top:14px">
          <h4 style="margin-bottom:10px">✍️ আপনার রিভিউ লিখুন</h4>
          <div class="form-group"><input id="rv-name" class="form-control" placeholder="আপনার নাম *" required></div>
          <div class="form-group">
            <select id="rv-rating" class="form-control">
              <option value="5">★★★★★ (৫ স্টার - অসাধারণ)</option>
              <option value="4">★★★★☆ (৪ স্টার - ভালো)</option>
              <option value="3">★★★☆☆ (৩ স্টার - মোটামুটি)</option>
              <option value="2">★★☆☆☆ (২ স্টার)</option>
              <option value="1">★☆☆☆☆ (১ স্টার)</option>
            </select>
          </div>
          <div class="form-group"><textarea id="rv-comment" class="form-control" rows="2" placeholder="পণ্যটি কেমন লেগেছে লিখুন *" required></textarea></div>
          <div class="form-group"><input id="rv-img" class="form-control" placeholder="পণ্যের ছবির লিংক (ঐচ্ছিক)"></div>
          <button class="btn btn-dark btn-sm" type="submit">রিভিউ সাবমিট করুন</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('review-form').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await EShop.api('/reviews', {
      method: 'POST',
      body: JSON.stringify({
        product_id: p.id,
        customer_name: document.getElementById('rv-name').value,
        rating: Number(document.getElementById('rv-rating').value),
        comment: document.getElementById('rv-comment').value,
        image: document.getElementById('rv-img').value
      })
    });
    if (r.ok) { EShop.toast(r.message); location.reload(); }
    else EShop.toast(r.error || 'Error');
  });

  if (res.related && res.related.length) {
    document.getElementById('related-wrap').style.display = 'block';
    document.getElementById('related-grid').innerHTML = res.related.map(EShop.renderProductCard).join('');
  }
}

window.switchImg = (el, src) => {
  document.getElementById('main-img').src = src;
  document.querySelectorAll('.gallery-thumbs img').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
};
window.pickColor = (el, c) => { selectedColor = c; el.parentElement.querySelectorAll('.variant-chip').forEach(b=>b.classList.remove('active')); el.classList.add('active'); };
window.pickSize = (el, s) => { selectedSize = s; el.parentElement.querySelectorAll('.variant-chip').forEach(b=>b.classList.remove('active')); el.classList.add('active'); };
window.chgQty = d => { qty = Math.max(1, qty + d); document.getElementById('pdp-qty').textContent = qty; };
function getVariantStr() { return [selectedColor, selectedSize].filter(Boolean).join(' / '); }
window.addCurrent = () => EShop.addToCart(currentProduct, qty, getVariantStr());
window.buyNow = () => { EShop.addToCart(currentProduct, qty, getVariantStr()); location.href = '/checkout.html'; };

initProduct();

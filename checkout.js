let appliedCoupon = null;
let couponDiscount = 0;
let incompleteTimer = null;

async function initCheckout() {
  await EShop.mountLayout();
  const cart = EShop.getCart();
  const root = document.getElementById('checkout-root');
  const s = EShop.state.settings;

  if (!cart.length) {
    root.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:44px"><h3>আপনার কার্ট খালি!</h3><a href="/" class="btn btn-primary" style="margin-top:14px">শপিং শুরু করুন</a></div>`;
    return;
  }

  EShop.trackEvent('InitiateCheckout', {
    value: cart.reduce((a, b) => a + b.price * b.qty, 0),
    content_ids: cart.map(i => String(i.id))
  });

  // Pre-fill logged-in user if available
  let user = null;
  if (localStorage.getItem('eshopbd_user_token')) {
    const me = await EShop.api('/account/me');
    if (me.ok) user = me.user;
  }

  const inDhaka = Number(s.delivery_inside_dhaka || 60);
  const subDhaka = Number(s.delivery_sub_dhaka || 100);
  const outDhaka = Number(s.delivery_outside_dhaka || 120);

  root.innerHTML = `
    <form id="co-form" class="card">
      <h3 style="margin-bottom:14px">📋 ডেলিভারি তথ্য দিন</h3>
      <div class="form-group">
        <label>আপনার সম্পূর্ণ নাম *</label>
        <input id="co-name" class="form-control" value="${user?.name || ''}" placeholder="যেমন: নাজমুল হাসান" required>
      </div>
      <div class="form-group">
        <label>সচল মোবাইল নম্বর (১১ ডিজিট) *</label>
        <input id="co-phone" class="form-control" value="${user?.phone || ''}" placeholder="01XXXXXXXXX" pattern="01[0-9]{9}" required>
      </div>
      <div class="form-group">
        <label>সম্পূর্ণ ঠিকানা (বাড়ি/রোড/এলাকা/থানা/জেলা) *</label>
        <textarea id="co-addr" class="form-control" rows="2" placeholder="আপনার পূর্ণাঙ্গ ডেলিভারি ঠিকানা লিখুন" required>${user?.address || ''}</textarea>
      </div>
      <div class="form-group">
        <label>ডেলিভারি এরিয়া নির্বাচন করুন:</label>
        <label class="zone-option active"><input type="radio" name="zone" value="inside_dhaka" checked onchange="recalc()"> <span>ঢাকা সিটির ভেতরে</span> <strong>${EShop.money(inDhaka)}</strong></label>
        <label class="zone-option"><input type="radio" name="zone" value="sub_dhaka" onchange="recalc()"> <span>ঢাকা সাব-এরিয়া (সাভার/গাজীপুর/কেরানীগঞ্জ)</span> <strong>${EShop.money(subDhaka)}</strong></label>
        <label class="zone-option"><input type="radio" name="zone" value="outside_dhaka" onchange="recalc()"> <span>ঢাকার বাইরে (সারা বাংলাদেশ)</span> <strong>${EShop.money(outDhaka)}</strong></label>
      </div>

      <div class="form-group">
        <label>পেমেন্ট মেথড:</label>
        <label class="pay-option active"><input type="radio" name="pay" value="cod" checked onchange="togglePay()"> <span>💵 ক্যাশ অন ডেলিভারি (পণ্য হাতে পেয়ে টাকা)</span></label>
        ${s.manual_mfs_enabled !== '0' ? `
          <label class="pay-option"><input type="radio" name="pay" value="bkash" onchange="togglePay()"> <span>📱 bKash (${s.bkash_number || 'Personal'})</span></label>
          <label class="pay-option"><input type="radio" name="pay" value="nagad" onchange="togglePay()"> <span>📱 Nagad (${s.nagad_number || 'Personal'})</span></label>
        ` : ''}
      </div>

      <div id="mfs-box" style="display:none;background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:10px;margin-bottom:14px">
        <p style="font-size:13px;margin-bottom:8px">উপরের নম্বরে Send Money করে আপনার নম্বর ও Transaction ID (TrxID) নিচে দিন:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input id="co-sender" class="form-control" placeholder="যে নম্বর থেকে পাঠিয়েছেন">
          <input id="co-trx" class="form-control" placeholder="Transaction ID (TrxID)">
        </div>
      </div>

      ${user && user.loyalty_points > 0 ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;border-radius:9px;margin-bottom:14px;font-size:13px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="co-redeem" onchange="recalc()">
            <span>🎁 আপনার <strong>${user.loyalty_points}</strong> লয়্যালটি পয়েন্ট ব্যবহার করুন (সর্বোচ্চ ২৫% ছাড়)</span>
          </label>
        </div>` : ''}

      <div class="form-group">
        <label>অর্ডার নোট (ঐচ্ছিক)</label>
        <input id="co-note" class="form-control" placeholder="কোনো বিশেষ নির্দেশনা থাকলে লিখুন">
      </div>

      <button id="co-submit" type="submit" class="btn btn-primary btn-lg btn-block">✅ অর্ডার কনফার্ম করুন</button>
    </form>

    <div class="card" style="height:fit-content">
      <h3 style="margin-bottom:12px">🛍️ আপনার অর্ডার সামারি</h3>
      <div id="co-items"></div>
      <div style="display:flex;gap:6px;margin:14px 0">
        <input id="co-coupon" class="form-control" placeholder="কুপন কোড (যেমন: WELCOME100)">
        <button type="button" class="btn btn-dark btn-sm" onclick="applyCoupon()">প্রয়োগ</button>
      </div>
      <div id="co-totals" style="border-top:1px solid var(--border);padding-top:12px;font-size:14px"></div>
    </div>
  `;

  // Auto-Capture Incomplete Order when phone is typed
  ['co-name', 'co-phone', 'co-addr'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(incompleteTimer);
      incompleteTimer = setTimeout(captureIncomplete, 1400);
    });
  });

  document.getElementById('co-form').addEventListener('submit', placeOrder);
  recalc();
}

function captureIncomplete() {
  const phone = (document.getElementById('co-phone')?.value || '').replace(/[^0-9]/g, '');
  if (phone.length < 11) return;
  const cart = EShop.getCart();
  const subtotal = cart.reduce((a, b) => a + b.price * b.qty, 0);
  EShop.api('/incomplete-orders', {
    method: 'POST',
    body: JSON.stringify({
      session_id: EShop.getSessionId(),
      customer_name: document.getElementById('co-name').value,
      customer_phone: phone,
      customer_address: document.getElementById('co-addr').value,
      delivery_zone: document.querySelector('input[name="zone"]:checked')?.value || 'inside_dhaka',
      items: cart,
      subtotal
    })
  });
}

window.togglePay = () => {
  const val = document.querySelector('input[name="pay"]:checked')?.value;
  document.querySelectorAll('.pay-option').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
  document.getElementById('mfs-box').style.display = (val === 'bkash' || val === 'nagad') ? 'block' : 'none';
};

window.recalc = () => {
  document.querySelectorAll('.zone-option').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
  const cart = EShop.getCart();
  const s = EShop.state.settings;
  let subtotal = 0, bulkDisc = 0;

  document.getElementById('co-items').innerHTML = cart.map(i => {
    subtotal += i.price * i.qty;
    if (i.bulk_discount && i.bulk_discount.min_qty && i.qty >= i.bulk_discount.min_qty) bulkDisc += Number(i.bulk_discount.discount_amount || 0);
    return `
      <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <img src="${i.image || ''}" style="width:48px;height:48px;border-radius:7px;object-fit:cover">
        <div style="flex:1;font-size:13px"><strong>${EShop.pName(i)}</strong><div>${i.variant || ''} × ${i.qty}</div></div>
        <strong>${EShop.money(i.price * i.qty)}</strong>
      </div>`;
  }).join('');

  const zone = document.querySelector('input[name="zone"]:checked')?.value || 'inside_dhaka';
  let del = zone === 'inside_dhaka' ? Number(s.delivery_inside_dhaka || 60) : (zone === 'sub_dhaka' ? Number(s.delivery_sub_dhaka || 100) : Number(s.delivery_outside_dhaka || 120));
  const freeTh = Number(s.free_delivery_threshold || 0);
  if (freeTh > 0 && subtotal >= freeTh) del = 0;

  const grand = Math.max(0, subtotal + del - bulkDisc - couponDiscount);
  document.getElementById('co-totals').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>সাবটোটাল:</span><span>${EShop.money(subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>ডেলিভারি চার্জ:</span><span>${del === 0 ? '<strong style="color:var(--success)">ফ্রি!</strong>' : EShop.money(del)}</span></div>
    ${bulkDisc > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--success)"><span>কম্বো ডিসকাউন্ট:</span><span>-${EShop.money(bulkDisc)}</span></div>` : ''}
    ${couponDiscount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--success)"><span>কুপন (${appliedCoupon}):</span><span>-${EShop.money(couponDiscount)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">
      <span>সর্বমোট পরিশোধযোগ্য:</span><span style="color:var(--primary)">${EShop.money(grand)}</span>
    </div>
  `;
};

window.applyCoupon = async () => {
  const code = document.getElementById('co-coupon').value.trim();
  const subtotal = EShop.getCart().reduce((a, b) => a + b.price * b.qty, 0);
  const res = await EShop.api('/coupons/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) });
  if (res.ok) {
    appliedCoupon = res.coupon.code;
    couponDiscount = res.discount;
    EShop.toast(`কুপন প্রয়োগ হয়েছে! ছাড়: ${EShop.money(couponDiscount)}`);
    recalc();
  } else EShop.toast(res.error || 'কুপন সঠিক নয়');
};

async function placeOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('co-submit');
  btn.disabled = true; btn.textContent = 'অর্ডার প্রসেস হচ্ছে...';

  const res = await EShop.api('/orders', {
    method: 'POST',
    body: JSON.stringify({
      session_id: EShop.getSessionId(),
      customer_name: document.getElementById('co-name').value,
      customer_phone: document.getElementById('co-phone').value,
      customer_address: document.getElementById('co-addr').value,
      delivery_zone: document.querySelector('input[name="zone"]:checked').value,
      payment_method: document.querySelector('input[name="pay"]:checked').value,
      payment_sender: document.getElementById('co-sender')?.value || '',
      payment_trx_id: document.getElementById('co-trx')?.value || '',
      coupon_code: appliedCoupon || '',
      redeem_points: Boolean(document.getElementById('co-redeem')?.checked),
      customer_note: document.getElementById('co-note').value,
      items: EShop.getCart(),
      source: 'website'
    })
  });

  if (!res.ok) {
    EShop.toast(res.error || 'অর্ডার করতে সমস্যা হয়েছে');
    btn.disabled = false; btn.textContent = '✅ অর্ডার কনফার্ম করুন';
    return;
  }

  EShop.clearCart();
  const o = res.order;
  if (window.fbq) try { window.fbq('track', 'Purchase', { currency: 'BDT', value: o.total_amount }, { eventID: o.order_number }); } catch {}

  document.getElementById('checkout-root').innerHTML = `
    <div class="card" style="grid-column:1/-1;max-width:640px;margin:10px auto;text-align:center;padding:30px">
      <div style="font-size:54px">🎉</div>
      <h2 style="color:var(--success);margin:8px 0">আপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে!</h2>
      <p style="font-size:15px">অর্ডার নম্বর: <strong style="color:var(--primary);font-size:18px">#${o.order_number}</strong></p>
      <p style="color:var(--muted);margin:8px 0 18px">আমাদের প্রতিনিধি শীঘ্রই আপনাকে কল করে অর্ডারটি কনফার্ম করবেন।</p>
      <div style="text-align:left;background:#f8fafc;padding:14px;border-radius:10px;font-size:13.5px;margin-bottom:18px">
        <div><strong>নাম:</strong> ${o.customer_name} | <strong>ফোন:</strong> ${o.customer_phone}</div>
        <div><strong>ঠিকানা:</strong> ${o.customer_address}</div>
        <div><strong>সর্বমোট বিল:</strong> ${EShop.money(o.total_amount)} (${o.payment_method.toUpperCase()})</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <a href="/track.html?q=${encodeURIComponent(o.order_number)}" class="btn btn-primary">📦 অর্ডার ট্র্যাক করুন</a>
        <button class="btn btn-outline" onclick="window.print()">🖨️ ইনভয়েস প্রিন্ট</button>
        <a href="/" class="btn btn-dark">আরও শপিং করুন</a>
      </div>
    </div>
  `;
}

initCheckout();

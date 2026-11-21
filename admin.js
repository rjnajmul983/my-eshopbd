const LS_ADMIN_TOKEN = 'eshopbd_admin_token';
const LS_ADMIN_USER = 'eshopbd_admin_user';
let currentTab = 'dashboard';
let currentUser = null;
let cachedCategories = [];
let lastOrderCount = null;

function toast(msg) {
  const t = document.getElementById('admin-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2800);
}

function money(n) { return '৳' + Math.round(Number(n || 0)).toLocaleString('en-BD'); }

async function aapi(path, opts = {}) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({ ok: false, error: 'Server error' }));
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem(LS_ADMIN_TOKEN);
    renderAuthScreen();
  }
  return { status: res.status, ...data };
}

function openAdminModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-bg').classList.add('open');
}
window.closeAdminModal = () => document.getElementById('modal-bg').classList.remove('open');

// Browser-side Auto-WebP Compressor for fast zero-credit-card uploads
function compressToWebP(file, maxWidth = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function bootAdmin() {
  const health = await aapi('/health');
  if (!health.db_bound) {
    document.getElementById('admin-root').innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <h2 style="color:var(--danger)">⚠️ Cloudflare D1 Database কানেক্ট করা নেই</h2>
        <p style="margin:12px 0;color:var(--muted)">Cloudflare Dashboard → Pages → আপনার প্রজেক্ট → Settings → Functions → <b>D1 database bindings</b> এ গিয়ে Variable Name <code>DB</code> দিয়ে আপনার D1 ডাটাবেস সিলেক্ট করে Save ও Redeploy করুন।</p>
        <button class="btn btn-primary btn-block" onclick="location.reload()">আবার চেক করুন</button>
      </div></div>`;
    return;
  }

  if (!health.db_initialized) {
    renderSetupScreen();
    return;
  }

  const token = localStorage.getItem(LS_ADMIN_TOKEN);
  const savedU = localStorage.getItem(LS_ADMIN_USER);
  if (token && savedU) {
    currentUser = JSON.parse(savedU);
    renderShell();
    loadTab('dashboard');
    startOrderPolling();
  } else {
    renderAuthScreen();
  }
}

function renderSetupScreen() {
  document.getElementById('admin-root').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h2>🚀 ১-ক্লিক ডাটাবেস সেটআপ</h2>
        <p style="color:var(--muted);margin:10px 0 18px">আপনার Cloudflare D1 ডাটাবেস কানেক্টেড আছে! নিচের বাটনে ক্লিক করলে অটোমেটিক সব টেবিল, অ্যাডমিন অ্যাকাউন্ট এবং ডেমো প্রোডাক্ট তৈরি হয়ে যাবে।</p>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
          <input type="checkbox" id="seed-demo" checked> ডেমো ক্যাটাগরি, ব্যানার ও প্রোডাক্ট যোগ করুন
        </label>
        <button id="init-btn" class="btn btn-primary btn-block" style="padding:12px" onclick="runInitDb()">⚡ Initialize Database Now</button>
      </div>
    </div>`;
}

window.runInitDb = async () => {
  const btn = document.getElementById('init-btn');
  btn.disabled = true; btn.textContent = 'সেটআপ হচ্ছে...';
  const r = await aapi('/admin/init-db', { method: 'POST', body: JSON.stringify({ seed_demo: document.getElementById('seed-demo').checked }) });
  if (r.ok) {
    alert(`সফল!\nঅ্যাডমিন ফোন: ${r.default_admin_phone}\nপাসওয়ার্ড: admin1234 (অথবা আপনার CF Env ADMIN_PASSWORD)`);
    renderAuthScreen();
  } else {
    alert('Error: ' + r.error);
    btn.disabled = false; btn.textContent = 'আবার চেষ্টা করুন';
  }
};

function renderAuthScreen() {
  document.getElementById('admin-root').innerHTML = `
    <div class="auth-wrap">
      <form id="adm-login" class="auth-card">
        <h2 style="margin-bottom:6px">⚙️ E-ShopBD Admin Login</h2>
        <p style="color:var(--muted);font-size:13px;margin-bottom:18px">ওয়েবসাইট, অর্ডার, প্রোডাক্ট ও API কন্ট্রোল প্যানেল</p>
        <div class="fg"><label>অ্যাডমিন ফোন নম্বর</label><input id="al-phone" class="fc" value="01700000000" required></div>
        <div class="fg"><label>পাসওয়ার্ড</label><input id="al-pass" type="password" class="fc" placeholder="ডিফল্ট: admin1234" required></div>
        <button class="btn btn-primary btn-block" style="padding:11px;margin-top:8px">লগইন করুন</button>
        <div style="text-align:center;margin-top:14px"><a href="/" style="font-size:13px;color:var(--muted)">← স্টোরে ফিরে যান</a></div>
      </form>
    </div>`;
  document.getElementById('adm-login').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await aapi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: document.getElementById('al-phone').value, password: document.getElementById('al-pass').value })
    });
    if (r.ok && ['super_admin', 'moderator'].includes(r.user.role)) {
      localStorage.setItem(LS_ADMIN_TOKEN, r.token);
      localStorage.setItem(LS_ADMIN_USER, JSON.stringify(r.user));
      currentUser = r.user;
      renderShell();
      loadTab('dashboard');
      startOrderPolling();
    } else toast(r.error || 'অ্যাডমিন অ্যাক্সেস অনুমোদিত নয়');
  });
}

function renderShell() {
  const isSuper = currentUser.role === 'super_admin';
  const nav = [
    { group: 'অপারেশন' },
    { id: 'dashboard', icon: '📊', label: 'ড্যাশবোর্ড ও লাভ-ক্ষতি' },
    { id: 'orders', icon: '📦', label: 'অর্ডার ম্যানেজমেন্ট', badge: 'ord-badge' },
    { id: 'incomplete', icon: '🧲', label: 'ইনকমপ্লিট অর্ডার (Leads)', badge: 'inc-badge' },
    { group: 'ক্যাটালগ' },
    { id: 'products', icon: '🛍️', label: 'প্রোডাক্ট ও স্টক' },
    { id: 'categories', icon: '📂', label: 'ক্যাটাগরি' },
    { id: 'banners', icon: '🖼️', label: 'হোম ব্যানার ও স্লাইডার' },
    { id: 'coupons', icon: '🎟️', label: 'কুপন কোড' },
    { id: 'reviews', icon: '⭐', label: 'কাস্টমার রিভিউ' },
    { group: 'ব্যবসা ও সিকিউরিটি' },
    { id: 'customers', icon: '👥', label: 'কাস্টমার ও পয়েন্ট' },
    ...(isSuper ? [{ id: 'expenses', icon: '💸', label: 'খরচ ও মার্কেটিং (P&L)' }] : []),
    { id: 'fraud', icon: '🛡️', label: 'ফ্রড শিল্ড (ব্লক লিস্ট)' },
    ...(isSuper ? [
      { group: 'API, অ্যাপ ও সেটিংস' },
      { id: 'api_hub', icon: '🔌', label: 'API ও মোবাইল অ্যাপ হাব' },
      { id: 'staff', icon: '🔑', label: 'স্টাফ ও রোল' },
      { id: 'settings', icon: '⚙️', label: 'সাইট সেটিংস ও পেজ' }
    ] : [])
  ];

  document.getElementById('admin-root').innerHTML = `
    <div class="admin-shell">
      <aside id="adm-sidebar" class="sidebar">
        <div class="sidebar-brand">
          <span>E-ShopBD Admin</span>
          <button onclick="toggleSidebar()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;display:none" id="sb-close">✕</button>
        </div>
        <div style="padding-bottom:24px">
          ${nav.map(n => n.group
            ? `<div class="nav-group">${n.group}</div>`
            : `<button class="nav-item" data-tab="${n.id}" onclick="loadTab('${n.id}')"><span>${n.icon}</span><span>${n.label}</span>${n.badge ? `<span id="${n.badge}" class="nav-badge" style="display:none">0</span>` : ''}</button>`
          ).join('')}
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="menu-toggle" onclick="toggleSidebar()">☰</button>
            <strong id="page-title" style="font-size:16px">ড্যাশবোর্ড</strong>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <a href="/" target="_blank" class="btn btn-outline btn-sm">🌐 সাইট দেখুন ↗</a>
            <span style="font-size:12.5px;color:var(--muted)">${currentUser.name} (${currentUser.role})</span>
            <button class="btn btn-danger btn-sm" onclick="logoutAdmin()">লগআউট</button>
          </div>
        </header>
        <main id="adm-content" class="content"></main>
      </div>
    </div>`;
}

window.toggleSidebar = () => document.getElementById('adm-sidebar')?.classList.toggle('open');
window.logoutAdmin = () => { localStorage.removeItem(LS_ADMIN_TOKEN); localStorage.removeItem(LS_ADMIN_USER); location.reload(); };

function startOrderPolling() {
  setInterval(async () => {
    const r = await aapi('/admin/dashboard');
    if (!r.ok) return;
    const pend = r.status_counts?.pending || 0;
    const inc = r.incomplete_open || 0;
    const ob = document.getElementById('ord-badge');
    const ib = document.getElementById('inc-badge');
    if (ob) { ob.textContent = pend; ob.style.display = pend > 0 ? 'inline-block' : 'none'; }
    if (ib) { ib.textContent = inc; ib.style.display = inc > 0 ? 'inline-block' : 'none'; }
    if (lastOrderCount !== null && pend > lastOrderCount) {
      toast('🔔 নতুন অর্ডার এসেছে!');
      try { new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU').play(); } catch {}
    }
    lastOrderCount = pend;
  }, 30000);
}

window.loadTab = async function(tab) {
  currentTab = tab;
  document.getElementById('adm-sidebar')?.classList.remove('open');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const box = document.getElementById('adm-content');
  box.innerHTML = '<div class="panel">লোড হচ্ছে...</div>';

  if (tab === 'dashboard') return renderDashboard(box);
  if (tab === 'orders') return renderOrders(box);
  if (tab === 'incomplete') return renderIncomplete(box);
  if (tab === 'products') return renderProducts(box);
  if (tab === 'categories') return renderCategories(box);
  if (tab === 'banners') return renderBanners(box);
  if (tab === 'coupons') return renderCoupons(box);
  if (tab === 'reviews') return renderReviews(box);
  if (tab === 'customers') return renderCustomers(box);
  if (tab === 'expenses') return renderExpenses(box);
  if (tab === 'fraud') return renderFraud(box);
  if (tab === 'api_hub') return renderApiHub(box);
  if (tab === 'staff') return renderStaff(box);
  if (tab === 'settings') return renderSettings(box);
};

// ==================== 1. DASHBOARD & P&L ====================
async function renderDashboard(box) {
  document.getElementById('page-title').textContent = '📊 ড্যাশবোর্ড ও লাভ-ক্ষতির হিসাব';
  const r = await aapi('/admin/dashboard?days=30');
  if (!r.ok) return (box.innerHTML = `<div class="panel">${r.error}</div>`);
  const sc = r.status_counts || {};
  const fin = r.financials;
  const ob = document.getElementById('ord-badge');
  if (ob && sc.pending) { ob.textContent = sc.pending; ob.style.display = 'inline-block'; }
  const ib = document.getElementById('inc-badge');
  if (ib && r.incomplete_open) { ib.textContent = r.incomplete_open; ib.style.display = 'inline-block'; }

  // Simple SVG Bar Chart
  const chart = r.daily_chart || [];
  const maxSales = Math.max(100, ...chart.map(d => Number(d.sales)));
  const chartSvg = chart.length ? `
    <div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding-top:16px">
      ${chart.map(d => {
        const h = Math.max(8, Math.round((Number(d.sales) / maxSales) * 120));
        return `<div style="flex:1;text-align:center">
          <div title="${d.day}: ${money(d.sales)} (${d.orders} orders)" style="height:${h}px;background:var(--primary);border-radius:6px 6px 0 0"></div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">${d.day.slice(5)}</div>
        </div>`;
      }).join('')}
    </div>` : '<p style="color:var(--muted)">এখনও পর্যাপ্ত বিক্রির ডাটা নেই।</p>';

  box.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">আজকের অর্ডার</div><div class="kpi-val">${r.today?.orders || 0}</div><div class="kpi-sub">বিক্রি: ${money(r.today?.sales)}</div></div>
      <div class="kpi-card"><div class="kpi-label">পেন্ডিং অর্ডার</div><div class="kpi-val" style="color:var(--amber)">${sc.pending || 0}</div><div class="kpi-sub">কনফার্মড: ${sc.confirmed || 0} | শিপড: ${sc.shipped || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">ডেলিভারড</div><div class="kpi-val" style="color:var(--green)">${sc.delivered || 0}</div><div class="kpi-sub">রিটার্ন: ${sc.returned || 0} | ক্যান্সেল: ${sc.cancelled || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">ইনকমপ্লিট লিড</div><div class="kpi-val" style="color:var(--blue)">${r.incomplete_open || 0}</div><div class="kpi-sub"><a href="javascript:loadTab('incomplete')" style="color:var(--blue)">কল করে কনফার্ম করুন →</a></div></div>
    </div>

    ${fin ? `
      <div class="panel">
        <div class="panel-head"><h3>💰 গত ৩০ দিনের নিট লাভ-ক্ষতির হিসাব (Profit & Loss)</h3><button class="btn btn-outline btn-sm" onclick="loadTab('expenses')">+ খরচ এন্ট্রি</button></div>
        <div class="kpi-grid" style="margin-bottom:0">
          <div class="kpi-card"><div class="kpi-label">মোট সেলস (Gross)</div><div class="kpi-val">${money(fin.gross_sales)}</div></div>
          <div class="kpi-card"><div class="kpi-label">প্রোডাক্ট ক্রয়মূল্য (COGS)</div><div class="kpi-val" style="color:var(--muted)">-${money(fin.product_cost)}</div></div>
          <div class="kpi-card"><div class="kpi-label">অ্যাড/খরচ + রিটার্ন লস</div><div class="kpi-val" style="color:var(--danger)">-${money(fin.other_expenses + fin.return_loss)}</div></div>
          <div class="kpi-card" style="background:#f0fdf4;border-color:#86efac"><div class="kpi-label">আনুমানিক নিট লাভ (Net Profit)</div><div class="kpi-val" style="color:var(--green)">${money(fin.net_profit)}</div></div>
        </div>
      </div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div class="panel">
        <h3 style="margin-bottom:10px">📈 গত ১৪ দিনের সেলস চার্ট</h3>
        ${chartSvg}
      </div>
      <div class="panel">
        <h3 style="margin-bottom:10px">⚠️ লো-স্টক অ্যালার্ট (স্টক ≤ ৫)</h3>
        ${r.low_stock.length ? `<table><tr><th>প্রোডাক্ট</th><th>SKU</th><th>স্টক</th></tr>${r.low_stock.map(p => `<tr><td>${p.name}</td><td>${p.sku}</td><td><span class="badge b-cancelled">${p.stock}</span></td></tr>`).join('')}</table>` : '<p style="color:var(--green)">✅ সব প্রোডাক্ট পর্যাপ্ত স্টকে আছে।</p>'}
      </div>
    </div>
  `;
}

// ==================== 2. ORDERS + COURIER + FRAUD + THERMAL STICKER ====================
async function renderOrders(box, statusFilter = '', q = '') {
  document.getElementById('page-title').textContent = '📦 অর্ডার ম্যানেজমেন্ট';
  const qs = new URLSearchParams();
  if (statusFilter) qs.set('status', statusFilter);
  if (q) qs.set('q', q);
  const r = await aapi('/admin/orders?' + qs.toString());
  const orders = r.orders || [];
  const statuses = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

  box.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${statuses.map(st => `<button class="btn btn-sm ${statusFilter===st?'btn-primary':'btn-outline'}" onclick="filterOrders('${st}')">${st || 'সব'}</button>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="ord-search" class="fc" style="width:200px" value="${q}" placeholder="অর্ডার # বা ফোন নম্বর...">
          <button class="btn btn-dark btn-sm" onclick="filterOrders('${statusFilter}', document.getElementById('ord-search').value)">খুঁজুন</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>অর্ডার #</th><th>কাস্টমার ও ঠিকানা</th><th>পণ্য</th><th>মোট বিল</th><th>স্ট্যাটাস</th><th>কুরিয়ার ও অ্যাকশন</th></tr></thead>
          <tbody>
            ${orders.length ? orders.map(o => `
              <tr>
                <td><strong>#${o.order_number}</strong><div style="font-size:11px;color:var(--muted)">${o.created_at}<br>${o.source}</div></td>
                <td>
                  <strong>${o.customer_name}</strong><br>
                  <a href="tel:${o.customer_phone}" style="color:var(--blue);font-weight:700">📞 ${o.customer_phone}</a>
                  <a target="_blank" href="https://wa.me/88${o.customer_phone.replace(/^88/,'')}?text=${encodeURIComponent('আসসালামু আলাইকুম '+o.customer_name+', আপনার অর্ডার #'+o.order_number+' ('+money(o.total_amount)+') কনফার্ম করার জন্য মেসেজ করছি।')}" style="margin-left:6px;color:var(--green);font-weight:700">💬 WA</a>
                  <div style="font-size:11.5px;color:var(--muted);max-width:220px">${o.customer_address}</div>
                </td>
                <td>${o.items.map(i => `<div style="font-size:12px">• ${i.name} ×${i.qty} ${i.variant?`(${i.variant})`:''}</div>`).join('')}</td>
                <td>
                  <strong>${money(o.total_amount)}</strong>
                  <div style="font-size:11px;color:var(--muted)">${o.payment_method.toUpperCase()} (${o.payment_status})</div>
                  ${o.payment_trx_id ? `<div style="font-size:11px;color:var(--blue)">Trx: ${o.payment_trx_id}</div>` : ''}
                </td>
                <td>
                  <select class="fc" style="padding:4px 6px;font-size:12px;width:118px" onchange="updateOrderStatus(${o.id}, this.value)">
                    ${statuses.slice(1).map(st => `<option value="${st}" ${o.status===st?'selected':''}>${st}</option>`).join('')}
                  </select>
                </td>
                <td>
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    <button class="btn btn-outline btn-sm" onclick="runFraudCheck('${o.customer_phone}')">🛡️ ফ্রড চেক</button>
                    <button class="btn btn-blue btn-sm" onclick="openCourierModal(${o.id}, '${o.order_number}')">🚚 কুরিয়ার</button>
                    <button class="btn btn-dark btn-sm" onclick='printSticker(${JSON.stringify(o).replace(/'/g,"&#39;")})'>🖨️ স্টিকার</button>
                  </div>
                  ${o.courier_consignment_id ? `<div style="font-size:11px;color:var(--green);margin-top:4px">✓ ${o.courier_name}: ${o.courier_tracking_code || o.courier_consignment_id}</div>` : ''}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">কোনো অর্ডার নেই</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

window.filterOrders = (st, q = '') => renderOrders(document.getElementById('adm-content'), st, q);

window.updateOrderStatus = async (id, status) => {
  const r = await aapi(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
  if (r.ok) toast('স্ট্যাটাস আপডেট হয়েছে: ' + status); else toast(r.error);
};

window.runFraudCheck = async phone => {
  openAdminModal('🛡️ কাস্টমার ফ্রড চেক রিপোর্ট', '<p>চেক করা হচ্ছে...</p>');
  const r = await aapi('/admin/fraud-check?phone=' + encodeURIComponent(phone));
  if (!r.ok) return;
  const rep = r.report;
  const h = rep.internal_history;
  const color = rep.risk_level === 'high' ? 'var(--danger)' : (rep.risk_level === 'medium' ? 'var(--amber)' : 'var(--green)');
  openAdminModal('🛡️ কাস্টমার ফ্রড চেক: ' + rep.phone, `
    <div style="padding:14px;border-radius:10px;background:#f8fafc;margin-bottom:12px">
      <div style="font-size:18px;font-weight:800;color:${color}">Risk Level: ${rep.risk_level.toUpperCase()}</div>
      <div style="margin-top:8px">মোট অর্ডার: <b>${h.total}</b> | ডেলিভারড: <b style="color:var(--green)">${h.delivered}</b> | ক্যান্সেল/রিটার্ন: <b style="color:var(--danger)">${h.cancelled}</b> | সাকসেস রেট: <b>${h.success_rate}%</b></div>
    </div>
    ${rep.external_courier_data ? `<div class="code-box">${JSON.stringify(rep.external_courier_data, null, 2)}</div>` : '<p style="font-size:12.5px;color:var(--muted)">এক্সটার্নাল কুরিয়ার ফ্রড চেক API কানেক্ট করতে API হাব এ URL ও Key সেট করুন।</p>'}
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn btn-danger btn-sm" onclick="banPhone('${rep.phone}')">🚫 এই নম্বর ব্লক করুন</button>
    </div>
  `);
};

window.banPhone = async phone => {
  await aapi('/admin/blocked', { method: 'POST', body: JSON.stringify({ type: 'phone', value: phone, reason: 'Blocked from Fraud Check' }) });
  toast('নম্বরটি ব্লক লিস্টে যোগ হয়েছে!');
  closeAdminModal();
};

window.openCourierModal = (id, orderNo) => {
  openAdminModal('🚚 ১-ক্লিক কুরিয়ার পার্সেল বুকিং (#' + orderNo + ')', `
    <p style="margin-bottom:14px;color:var(--muted)">আপনার API হাব-এ কনফিগার করা কুরিয়ার পার্টনারে ১ ক্লিকে পার্সেল এন্ট্রি পাঠান:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <button class="btn btn-green" onclick="sendToCourier(${id},'steadfast')">📦 Steadfast</button>
      <button class="btn btn-danger" onclick="sendToCourier(${id},'pathao')">🏍️ Pathao</button>
      <button class="btn btn-blue" onclick="sendToCourier(${id},'redx')">🚚 RedX</button>
    </div>
  `);
};

window.sendToCourier = async (id, provider) => {
  toast(`${provider.toUpperCase()}-এ পার্সেল পাঠানো হচ্ছে...`);
  const r = await aapi(`/admin/orders/${id}/courier`, { method: 'POST', body: JSON.stringify({ provider }) });
  if (r.ok) {
    toast(`✅ বুকিং সফল! ID: ${r.booking.consignment_id}`);
    closeAdminModal();
    loadTab('orders');
  } else alert('Courier Error: ' + r.error);
};

// Thermal Sticker / Invoice Printer with SVG Barcode
window.printSticker = o => {
  const bars = o.order_number.split('').map((ch, idx) => `<rect x="${10 + idx*12}" y="0" width="${(ch.charCodeAt(0)%3)+2}" height="38" fill="#000"/>`).join('');
  const w = window.open('', '_blank', 'width=420,height=580');
  w.document.write(`
    <html><head><title>Sticker #${o.order_number}</title><style>
      body{font-family:sans-serif;padding:12px;width:320px;border:2px solid #000;margin:10px auto}
      h2{margin:0 0 6px;font-size:18px} p{margin:3px 0;font-size:13px}
      .cod{border:2px solid #000;padding:8px;text-align:center;font-size:20px;font-weight:800;margin:10px 0}
    </style></head><body>
      <h2>E-ShopBD Parcel</h2>
      <p><b>Order:</b> #${o.order_number} | <b>Date:</b> ${o.created_at.slice(0,10)}</p>
      ${o.courier_consignment_id ? `<p><b>Courier:</b> ${o.courier_name} (${o.courier_consignment_id})</p>` : ''}
      <hr>
      <p><b>Customer:</b> ${o.customer_name}</p>
      <p><b>Phone:</b> ${o.customer_phone}</p>
      <p><b>Address:</b> ${o.customer_address}</p>
      <hr>
      <p><b>Items:</b> ${o.items.map(i => `${i.name} x${i.qty}`).join(', ')}</p>
      <div class="cod">COD: BDT ${o.payment_status==='paid' ? 0 : Math.round(o.total_amount)}</div>
      <div style="text-align:center"><svg width="160" height="42">${bars}</svg><div style="font-size:11px">${o.order_number}</div></div>
      <script>window.print()</script>
    </body></html>`);
  w.document.close();
};

// ==================== 3. INCOMPLETE ORDERS (LEADS) ====================
async function renderIncomplete(box) {
  document.getElementById('page-title').textContent = '🧲 ইনকমপ্লিট অর্ডার (Abandoned Leads)';
  const r = await aapi('/admin/incomplete-orders');
  const leads = r.leads || [];
  box.innerHTML = `
    <div class="panel">
      <p style="color:var(--muted);margin-bottom:12px">যারা চেকআউট পেজে মোবাইল নম্বর লিখে অর্ডার কনফার্ম করেননি, তাদের তালিকা। কল করে সহজেই সেলস ক্লোজ করুন!</p>
      <div class="table-wrap"><table>
        <thead><tr><th>সময়</th><th>নাম ও ফোন</th><th>ঠিকানা</th><th>কার্ট আইটেম</th><th>অ্যাকশন</th></tr></thead>
        <tbody>
          ${leads.length ? leads.map(l => `
            <tr>
              <td>${l.updated_at}</td>
              <td><strong>${l.customer_name || 'N/A'}</strong><br><a href="tel:${l.customer_phone}" style="color:var(--blue);font-weight:700">📞 ${l.customer_phone}</a></td>
              <td>${l.customer_address || '-'}</td>
              <td>${l.items.map(i => `${i.name} ×${i.qty}`).join(', ')} (${money(l.subtotal)})</td>
              <td>
                <a class="btn btn-green btn-sm" target="_blank" href="https://wa.me/88${l.customer_phone.replace(/^88/,'')}?text=${encodeURIComponent('আসসালামু আলাইকুম, আপনি আমাদের ওয়েবসাইটে অর্ডার করতে চেয়েছিলেন। কোনো সহায়তা লাগবে?')}">💬 WA</a>
                <button class="btn btn-danger btn-sm" onclick="delIncomplete(${l.id})">মুছুন</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">কোনো ইনকমপ্লিট অর্ডার নেই</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
window.delIncomplete = async id => { await aapi('/admin/incomplete-orders/' + id, { method: 'DELETE' }); loadTab('incomplete'); };

// ==================== 4. PRODUCTS CRUD + WEBP IMAGE UPLOAD ====================
async function renderProducts(box) {
  document.getElementById('page-title').textContent = '🛍️ প্রোডাক্ট ও স্টক ম্যানেজমেন্ট';
  const [pRes, cRes] = await Promise.all([aapi('/admin/products'), aapi('/admin/categories')]);
  cachedCategories = cRes.categories || [];
  const prods = pRes.products || [];

  box.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>মোট প্রোডাক্ট: ${prods.length}</h3>
        <button class="btn btn-primary" onclick="openProductModal()">+ নতুন প্রোডাক্ট যোগ করুন</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ছবি</th><th>নাম ও SKU</th><th>কেনা / বিক্রয় মূল্য</th><th>স্টক</th><th>বিক্রি</th><th>অ্যাকশন</th></tr></thead>
        <tbody>
          ${prods.map(p => `
            <tr>
              <td><img src="${(p.images && p.images[0]) || 'https://placehold.co/60'}" style="width:46px;height:46px;border-radius:7px;object-fit:cover"></td>
              <td>
                <strong>${p.name}</strong><div style="font-size:11.5px;color:var(--muted)">${p.name_bn || ''} | SKU: ${p.sku || '-'}</div>
                <a href="/landing.html?slug=${p.slug}" target="_blank" style="font-size:11px;color:var(--blue)">🎯 Landing Page ↗</a>
              </td>
              <td><span style="color:var(--muted)">কেনা: ${money(p.buying_price)}</span><br><strong style="color:var(--primary)">বিক্রি: ${money(p.sale_price)}</strong> <del style="font-size:11px">${money(p.regular_price)}</del></td>
              <td><span class="badge ${p.stock<=5?'b-cancelled':'b-delivered'}">${p.stock}</span></td>
              <td>${p.sold_count || 0}</td>
              <td>
                <button class="btn btn-outline btn-sm" onclick='openProductModal(${JSON.stringify(p).replace(/'/g,"&#39;")})'>এডিট</button>
                <button class="btn btn-danger btn-sm" onclick="delProduct(${p.id})">মুছুন</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
}

window.openProductModal = (p = null) => {
  const imgs = (p && p.images) ? p.images : [];
  const vars = (p && p.variants) ? p.variants : { colors: [], sizes: [] };
  const lc = (p && p.landing_content) ? p.landing_content : {};
  const bulk = (p && p.bulk_discount) ? p.bulk_discount : {};

  openAdminModal(p ? '✏️ প্রোডাক্ট এডিট করুন' : '+ নতুন প্রোডাক্ট যোগ করুন', `
    <form id="prod-form">
      <div class="form-grid">
        <div class="fg"><label>প্রোডাক্টের নাম (English) *</label><input id="pf-name" class="fc" value="${p?.name || ''}" required></div>
        <div class="fg"><label>বাংলা নাম (ঐচ্ছিক)</label><input id="pf-bn" class="fc" value="${p?.name_bn || ''}"></div>
        <div class="fg"><label>ক্যাটাগরি</label><select id="pf-cat" class="fc">${cachedCategories.map(c => `<option value="${c.id}" ${p?.category_id===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div class="fg"><label>SKU কোড</label><input id="pf-sku" class="fc" value="${p?.sku || ''}"></div>
        <div class="fg"><label>ব্র্যান্ড</label><input id="pf-brand" class="fc" value="${p?.brand || ''}"></div>
        <div class="fg"><label>ক্রয়মূল্য / Buying Price (৳) [লাভ হিসাবের জন্য]</label><input id="pf-buy" type="number" class="fc" value="${p?.buying_price || 0}"></div>
        <div class="fg"><label>রেগুলার দাম (৳) *</label><input id="pf-reg" type="number" class="fc" value="${p?.regular_price || 0}" required></div>
        <div class="fg"><label>অফার / বিক্রয়মূল্য (৳) *</label><input id="pf-sale" type="number" class="fc" value="${p?.sale_price || 0}" required></div>
        <div class="fg"><label>স্টক সংখ্যা *</label><input id="pf-stock" type="number" class="fc" value="${p?.stock ?? 20}" required></div>
      </div>

      <div class="fg">
        <label>ছবি আপলোড করুন (Auto-WebP → ImgBB/Cloudinary) অথবা নিচে URL দিন (প্রতি লাইনে ১টি):</label>
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <input type="file" id="pf-file" accept="image/*" class="fc" style="padding:5px">
          <button type="button" class="btn btn-blue btn-sm" onclick="uploadProductImg()">⬆️ আপলোড</button>
        </div>
        <textarea id="pf-imgs" class="fc" rows="2" placeholder="https://...">${imgs.join('\n')}</textarea>
      </div>

      <div class="form-grid">
        <div class="fg"><label>কালার ভ্যারিয়েন্ট (কমা দিয়ে)</label><input id="pf-colors" class="fc" value="${(vars.colors||[]).join(', ')}" placeholder="Black, Blue, Red"></div>
        <div class="fg"><label>সাইজ ভ্যারিয়েন্ট (কমা দিয়ে)</label><input id="pf-sizes" class="fc" value="${(vars.sizes||[]).join(', ')}" placeholder="M, L, XL"></div>
        <div class="fg"><label>কম্বো অফার (কতটি কিনলে ছাড়?)</label><input id="pf-bqty" type="number" class="fc" value="${bulk.min_qty || ''}" placeholder="যেমন: 2"></div>
        <div class="fg"><label>কম্বো ছাড়ের পরিমাণ (৳)</label><input id="pf-bdisc" type="number" class="fc" value="${bulk.discount_amount || ''}" placeholder="যেমন: 150"></div>
      </div>

      <div class="fg"><label>ভিডিও লিংক (YouTube/FB Reels)</label><input id="pf-video" class="fc" value="${p?.video_url || ''}"></div>
      <div class="fg"><label>সংক্ষিপ্ত বিবরণ</label><input id="pf-short" class="fc" value="${p?.short_desc || ''}"></div>
      <div class="fg"><label>বিস্তারিত বিবরণ (HTML সাপোর্টেড)</label><textarea id="pf-desc" class="fc" rows="3">${p?.description || ''}</textarea></div>
      <div class="fg"><label>ল্যান্ডিং পেজ হেডলাইন (FB Ads Funnel-এর জন্য)</label><input id="pf-lphead" class="fc" value="${lc.headline || ''}"></div>

      <div style="display:flex;gap:16px;margin:10px 0 16px">
        <label><input type="checkbox" id="pf-feat" ${p?.is_featured?'checked':''}> Featured</label>
        <label><input type="checkbox" id="pf-flash" ${p?.is_flash_sale?'checked':''}> Flash Sale</label>
      </div>
      <button class="btn btn-primary btn-block" type="submit">💾 প্রোডাক্ট সেভ করুন</button>
    </form>`);

  document.getElementById('prod-form').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('pf-name').value,
      name_bn: document.getElementById('pf-bn').value,
      category_id: Number(document.getElementById('pf-cat').value),
      sku: document.getElementById('pf-sku').value,
      brand: document.getElementById('pf-brand').value,
      buying_price: Number(document.getElementById('pf-buy').value),
      regular_price: Number(document.getElementById('pf-reg').value),
      sale_price: Number(document.getElementById('pf-sale').value),
      stock: Number(document.getElementById('pf-stock').value),
      images: document.getElementById('pf-imgs').value.split('\n').map(s=>s.trim()).filter(Boolean),
      variants: {
        colors: document.getElementById('pf-colors').value.split(',').map(s=>s.trim()).filter(Boolean),
        sizes: document.getElementById('pf-sizes').value.split(',').map(s=>s.trim()).filter(Boolean)
      },
      bulk_discount: document.getElementById('pf-bqty').value ? { min_qty: Number(document.getElementById('pf-bqty').value), discount_amount: Number(document.getElementById('pf-bdisc').value || 0) } : {},
      video_url: document.getElementById('pf-video').value,
      short_desc: document.getElementById('pf-short').value,
      description: document.getElementById('pf-desc').value,
      landing_content: { headline: document.getElementById('pf-lphead').value },
      is_featured: document.getElementById('pf-feat').checked,
      is_flash_sale: document.getElementById('pf-flash').checked
    };
    const r = await aapi(p ? `/admin/products/${p.id}` : '/admin/products', { method: p ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (r.ok) { toast('প্রোডাক্ট সেভ হয়েছে!'); closeAdminModal(); loadTab('products'); } else toast(r.error);
  });
};

window.uploadProductImg = async () => {
  const file = document.getElementById('pf-file').files[0];
  if (!file) return toast('আগে একটি ছবি সিলেক্ট করুন');
  toast('ছবি WebP-তে কম্প্রেস ও আপলোড হচ্ছে...');
  const webp = await compressToWebP(file);
  const r = await aapi('/admin/upload-image', { method: 'POST', body: JSON.stringify({ image_base64: webp }) });
  if (r.ok) {
    const ta = document.getElementById('pf-imgs');
    ta.value = (ta.value ? ta.value + '\n' : '') + r.url;
    toast(`✅ ছবি আপলোড হয়েছে (${r.provider})`);
  } else alert(r.error);
};

window.delProduct = async id => {
  if (!confirm('প্রোডাক্টটি মুছে ফেলবেন?')) return;
  await aapi('/admin/products/' + id, { method: 'DELETE' });
  loadTab('products');
};

// ==================== 5. CATEGORIES, BANNERS, COUPONS ====================
async function renderCategories(box) {
  document.getElementById('page-title').textContent = '📂 ক্যাটাগরি ম্যানেজমেন্ট';
  const r = await aapi('/admin/categories');
  box.innerHTML = `
    <div class="panel">
      <form id="cat-f" class="form-grid" style="margin-bottom:16px">
        <input id="c-name" class="fc" placeholder="Category Name (EN) *" required>
        <input id="c-bn" class="fc" placeholder="বাংলা নাম">
        <input id="c-ico" class="fc" placeholder="ইমোজি (যেমন ⌚)">
        <input id="c-img" class="fc" placeholder="Image URL">
        <button class="btn btn-primary">+ ক্যাটাগরি যোগ</button>
      </form>
      <table><tr><th>আইকন</th><th>নাম</th><th>Slug</th><th>অ্যাকশন</th></tr>
      ${(r.categories||[]).map(c => `<tr><td>${c.icon}</td><td><b>${c.name}</b> (${c.name_bn})</td><td>${c.slug}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('categories',${c.id})">মুছুন</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('cat-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/categories', { method: 'POST', body: JSON.stringify({ name: c('c-name'), name_bn: c('c-bn'), icon: c('c-ico')||'📦', image: c('c-img') }) });
    loadTab('categories');
  };
}

async function renderBanners(box) {
  document.getElementById('page-title').textContent = '🖼️ হোম স্লাইডার ও ব্যানার';
  const r = await aapi('/admin/banners');
  box.innerHTML = `
    <div class="panel">
      <form id="ban-f" class="form-grid" style="margin-bottom:16px">
        <input id="b-title" class="fc" placeholder="ব্যানার টাইটেল *" required>
        <input id="b-sub" class="fc" placeholder="সাবটাইটেল">
        <input id="b-img" class="fc" placeholder="ব্যানার ইমেজ URL *" required>
        <input id="b-lnk" class="fc" placeholder="ক্লিক লিংক (যেমন /?flash=1)">
        <button class="btn btn-primary">+ ব্যানার যোগ</button>
      </form>
      <table><tr><th>প্রিভিউ</th><th>টাইটেল</th><th>লিংক</th><th>অ্যাকশন</th></tr>
      ${(r.banners||[]).map(b => `<tr><td><img src="${b.image}" style="width:90px;height:44px;object-fit:cover;border-radius:6px"></td><td><b>${b.title}</b><div style="font-size:11.5px;color:var(--muted)">${b.subtitle}</div></td><td>${b.link}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('banners',${b.id})">মুছুন</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('ban-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/banners', { method: 'POST', body: JSON.stringify({ title: c('b-title'), subtitle: c('b-sub'), image: c('b-img'), link: c('b-lnk')||'/' }) });
    loadTab('banners');
  };
}

async function renderCoupons(box) {
  document.getElementById('page-title').textContent = '🎟️ কুপন কোড';
  const r = await aapi('/admin/coupons');
  box.innerHTML = `
    <div class="panel">
      <form id="cp-f" class="form-grid" style="margin-bottom:16px">
        <input id="cp-code" class="fc" placeholder="কোড (যেমন EID200) *" required>
        <select id="cp-type" class="fc"><option value="fixed">Fixed (৳)</option><option value="percent">Percent (%)</option></select>
        <input id="cp-val" type="number" class="fc" placeholder="ছাড়ের পরিমাণ *" required>
        <input id="cp-min" type="number" class="fc" placeholder="সর্বনিম্ন অর্ডার (৳)">
        <button class="btn btn-primary">+ কুপন তৈরি</button>
      </form>
      <table><tr><th>কোড</th><th>ডিসকাউন্ট</th><th>সর্বনিম্ন অর্ডার</th><th>ব্যবহৃত</th><th>অ্যাকশন</th></tr>
      ${(r.coupons||[]).map(x => `<tr><td><b>${x.code}</b></td><td>${x.value}${x.type==='percent'?'%':'৳'}</td><td>${money(x.min_order)}</td><td>${x.used_count}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('coupons',${x.id})">মুছুন</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('cp-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/coupons', { method: 'POST', body: JSON.stringify({ code: c('cp-code'), type: c('cp-type'), value: Number(c('cp-val')), min_order: Number(c('cp-min')||0) }) });
    loadTab('coupons');
  };
}

// ==================== 6. REVIEWS, CUSTOMERS, EXPENSES, FRAUD, STAFF ====================
async function renderReviews(box) {
  document.getElementById('page-title').textContent = '⭐ কাস্টমার রিভিউ';
  const r = await aapi('/admin/reviews');
  box.innerHTML = `<div class="panel"><table><tr><th>প্রোডাক্ট</th><th>কাস্টমার</th><th>রেটিং</th><th>মন্তব্য</th><th>অ্যাকশন</th></tr>
    ${(r.reviews||[]).map(x => `<tr><td>${x.product_name}</td><td>${x.customer_name}</td><td>${'★'.repeat(x.rating)}</td><td>${x.comment}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('reviews',${x.id})">মুছুন</button></td></tr>`).join('')}
  </table></div>`;
}

async function renderCustomers(box) {
  document.getElementById('page-title').textContent = '👥 রেজিস্টার্ড কাস্টমার';
  const r = await aapi('/admin/customers');
  box.innerHTML = `<div class="panel"><table><tr><th>নাম</th><th>ফোন</th><th>ঠিকানা</th><th>লয়্যালটি পয়েন্ট</th><th>তারিখ</th></tr>
    ${(r.customers||[]).map(u => `<tr><td><b>${u.name}</b></td><td>${u.phone}</td><td>${u.address||'-'}</td><td><span class="badge b-delivered">${u.loyalty_points} pts</span></td><td>${u.created_at}</td></tr>`).join('')}
  </table></div>`;
}

async function renderExpenses(box) {
  document.getElementById('page-title').textContent = '💸 খরচ ও মার্কেটিং (Profit & Loss)';
  const r = await aapi('/admin/expenses');
  box.innerHTML = `
    <div class="panel">
      <form id="exp-f" class="form-grid" style="margin-bottom:16px">
        <input id="e-title" class="fc" placeholder="খরচের বিবরণ (যেমন: FB Ads Boost) *" required>
        <select id="e-cat" class="fc"><option value="marketing">Marketing / FB Ads</option><option value="delivery_loss">Delivery / Return Loss</option><option value="office">Office / Rent</option><option value="salary">Staff Salary</option><option value="other">Other</option></select>
        <input id="e-amt" type="number" class="fc" placeholder="টাকার পরিমাণ *" required>
        <input id="e-date" type="date" class="fc" value="${new Date().toISOString().slice(0,10)}">
        <button class="btn btn-primary">+ খরচ যোগ</button>
      </form>
      <table><tr><th>তারিখ</th><th>বিবরণ</th><th>ক্যাটাগরি</th><th>টাকা</th><th>অ্যাকশন</th></tr>
      ${(r.expenses||[]).map(e => `<tr><td>${e.expense_date}</td><td><b>${e.title}</b></td><td>${e.category}</td><td style="color:var(--danger);font-weight:700">${money(e.amount)}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('expenses',${e.id})">মুছুন</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('exp-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/expenses', { method: 'POST', body: JSON.stringify({ title: c('e-title'), category: c('e-cat'), amount: Number(c('e-amt')), expense_date: c('e-date') }) });
    loadTab('expenses');
  };
}

async function renderFraud(box) {
  document.getElementById('page-title').textContent = '🛡️ ফ্রড শিল্ড (ব্লকড ফোন ও IP)';
  const r = await aapi('/admin/blocked');
  box.innerHTML = `
    <div class="panel">
      <form id="blk-f" class="form-grid" style="margin-bottom:16px">
        <select id="bl-type" class="fc"><option value="phone">Phone Number</option><option value="ip">IP Address</option></select>
        <input id="bl-val" class="fc" placeholder="017XXXXXXXX বা IP *" required>
        <input id="bl-rsn" class="fc" placeholder="কারণ (যেমন: Fake Order)">
        <button class="btn btn-danger">🚫 ব্লক করুন</button>
      </form>
      <table><tr><th>ধরণ</th><th>নম্বর / IP</th><th>কারণ</th><th>অ্যাকশন</th></tr>
      ${(r.blocked||[]).map(b => `<tr><td>${b.type}</td><td><b>${b.value}</b></td><td>${b.reason}</td><td><button class="btn btn-outline btn-sm" onclick="delRec('blocked',${b.id})">আনব্লক</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('blk-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/blocked', { method: 'POST', body: JSON.stringify({ type: c('bl-type'), value: c('bl-val'), reason: c('bl-rsn') }) });
    loadTab('fraud');
  };
}

async function renderStaff(box) {
  document.getElementById('page-title').textContent = '🔑 স্টাফ ও মাল্টি-অ্যাডমিন রোল';
  const r = await aapi('/admin/staff');
  box.innerHTML = `
    <div class="panel">
      <p style="color:var(--muted);margin-bottom:12px"><b>Moderator</b> শুধু অর্ডার, ইনকমপ্লিট লিড এবং প্রোডাক্ট ম্যানেজ করতে পারবে—মোট লাভ-ক্ষতি বা API Key দেখতে পারবে না।</p>
      <form id="stf-f" class="form-grid" style="margin-bottom:16px">
        <input id="st-name" class="fc" placeholder="স্টাফের নাম *" required>
        <input id="st-phone" class="fc" placeholder="ফোন নম্বর *" required>
        <input id="st-pass" class="fc" placeholder="পাসওয়ার্ড *" required>
        <select id="st-role" class="fc"><option value="moderator">Moderator (Order/Product)</option><option value="super_admin">Super Admin (Full)</option></select>
        <button class="btn btn-primary">+ স্টাফ তৈরি</button>
      </form>
      <table><tr><th>নাম</th><th>ফোন</th><th>রোল</th><th>অ্যাকশন</th></tr>
      ${(r.staff||[]).map(s => `<tr><td><b>${s.name}</b></td><td>${s.phone}</td><td><span class="badge b-confirmed">${s.role}</span></td><td><button class="btn btn-danger btn-sm" onclick="delRec('staff',${s.id})">মুছুন</button></td></tr>`).join('')}
      </table>
    </div>`;
  document.getElementById('stf-f').onsubmit = async e => {
    e.preventDefault();
    await aapi('/admin/staff', { method: 'POST', body: JSON.stringify({ name: c('st-name'), phone: c('st-phone'), password: c('st-pass'), role: c('st-role') }) });
    loadTab('staff');
  };
}

// ==================== 7. API & MOBILE APP INTEGRATION HUB ====================
async function renderApiHub(box) {
  document.getElementById('page-title').textContent = '🔌 API ও মোবাইল অ্যাপ ইন্টিগ্রেশন হাব';
  const [sRes, kRes] = await Promise.all([aapi('/admin/settings'), aapi('/admin/api-keys')]);
  const s = sRes.settings || {};
  const keys = kRes.api_keys || [];
  const baseUrl = `${location.origin}/api/v1`;

  box.innerHTML = `
    <div class="panel" style="border:2px solid var(--blue)">
      <div class="panel-head">
        <h3>📱 মোবাইল অ্যাপ কানেকশন (Android / Flutter Admin App Ready)</h3>
        <button class="btn btn-blue btn-sm" onclick="generateAppKey()">+ নতুন App API Key তৈরি করুন</button>
      </div>
      <p style="margin-bottom:10px;color:var(--muted)">আপনার ভবিষ্যতের অ্যান্ড্রয়েড/ফ্লাটার অ্যাপে নিচের Base URL এবং <code>X-API-Key</code> হেডার (অথবা JWT Login) বসালেই সম্পূর্ণ ওয়েবসাইট অ্যাপ থেকে কন্ট্রোল করা যাবে।</p>
      <div class="code-box" style="margin-bottom:12px">Base API URL: ${baseUrl}
Auth Header: X-API-Key: &lt;YOUR_GENERATED_KEY&gt;  (অথবা Authorization: Bearer &lt;JWT&gt;)
Endpoints: GET /admin/dashboard | GET /admin/orders | POST /admin/products | PUT /admin/orders/:id | POST /admin/upload-image</div>
      <div id="new-key-alert"></div>
      <table><tr><th>লেবেল</th><th>Key Prefix</th><th>রোল</th><th>সর্বশেষ ব্যবহার</th><th>অ্যাকশন</th></tr>
        ${keys.length ? keys.map(k => `<tr><td><b>${k.label}</b></td><td><code>${k.key_prefix}</code></td><td>${k.role}</td><td>${k.last_used_at || 'কখনো নয়'}</td><td><button class="btn btn-danger btn-sm" onclick="delRec('api-keys',${k.id})">Revoke</button></td></tr>`).join('') : '<tr><td colspan="5" style="color:var(--muted)">এখনও কোনো App API Key তৈরি করা হয়নি।</td></tr>'}
      </table>
    </div>

    <form id="api-settings-form">
      <div class="panel">
        <h3 style="margin-bottom:12px">🖼️ ফ্রি ইমেজ হোস্টিং API (ক্রেডিট কার্ড ছাড়া)</h3>
        <div class="form-grid">
          <div class="fg"><label>ইমেজ প্রোভাইডার</label><select name="image_provider" class="fc"><option value="imgbb" ${s.image_provider==='imgbb'?'selected':''}>ImgBB Free API</option><option value="cloudinary" ${s.image_provider==='cloudinary'?'selected':''}>Cloudinary Free Unsigned</option></select></div>
          <div class="fg"><label>ImgBB API Key (api.imgbb.com)</label><input name="imgbb_api_key" class="fc" value="${s.imgbb_api_key||''}"></div>
          <div class="fg"><label>Cloudinary Cloud Name</label><input name="cloudinary_cloud_name" class="fc" value="${s.cloudinary_cloud_name||''}"></div>
          <div class="fg"><label>Cloudinary Unsigned Preset</label><input name="cloudinary_upload_preset" class="fc" value="${s.cloudinary_upload_preset||''}"></div>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-bottom:12px">🚚 কুরিয়ার বুকিং API (Steadfast / Pathao / RedX)</h3>
        <div class="form-grid">
          <div class="fg"><label>Steadfast API Key</label><input name="steadfast_api_key" class="fc" value="${s.steadfast_api_key||''}"></div>
          <div class="fg"><label>Steadfast Secret Key</label><input name="steadfast_secret_key" class="fc" value="${s.steadfast_secret_key||''}"></div>
          <div class="fg"><label>Pathao Store ID</label><input name="pathao_store_id" class="fc" value="${s.pathao_store_id||''}"></div>
          <div class="fg"><label>Pathao Access Token</label><input name="pathao_access_token" class="fc" value="${s.pathao_access_token||''}"></div>
          <div class="fg"><label>RedX Access Token</label><input name="redx_access_token" class="fc" value="${s.redx_access_token||''}"></div>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-bottom:12px">📣 মার্কেটিং পিক্সেল ও সার্ভার-সাইড Facebook CAPI</h3>
        <div class="form-grid">
          <div class="fg"><label>Facebook Pixel ID</label><input name="fb_pixel_id" class="fc" value="${s.fb_pixel_id||''}"></div>
          <div class="fg"><label>Facebook CAPI Access Token</label><input name="fb_capi_token" class="fc" value="${s.fb_capi_token||''}"></div>
          <div class="fg"><label>FB CAPI Test Event Code (ঐচ্ছিক)</label><input name="fb_capi_test_code" class="fc" value="${s.fb_capi_test_code||''}"></div>
          <div class="fg"><label>TikTok Pixel ID</label><input name="tiktok_pixel_id" class="fc" value="${s.tiktok_pixel_id||''}"></div>
          <div class="fg"><label>Google Tag Manager (GTM-XXXX)</label><input name="gtm_id" class="fc" value="${s.gtm_id||''}"></div>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-bottom:12px">📲 SMS, Webhook, Fraud Check & Payment Gateway API</h3>
        <div class="form-grid">
          <div class="fg"><label>অটো SMS চালু?</label><select name="sms_enabled" class="fc"><option value="0" ${s.sms_enabled!=='1'?'selected':''}>বন্ধ</option><option value="1" ${s.sms_enabled==='1'?'selected':''}>চালু</option></select></div>
          <div class="fg"><label>SMS API URL</label><input name="sms_api_url" class="fc" value="${s.sms_api_url||''}"></div>
          <div class="fg"><label>SMS API Key</label><input name="sms_api_key" class="fc" value="${s.sms_api_key||''}"></div>
          <div class="fg"><label>SMS Sender ID</label><input name="sms_sender_id" class="fc" value="${s.sms_sender_id||''}"></div>
          <div class="fg"><label>Order Webhook URL (Telegram/Zapier/App)</label><input name="webhook_order_url" class="fc" value="${s.webhook_order_url||''}"></div>
          <div class="fg"><label>External Fraud Checker URL ({phone})</label><input name="fraud_check_api_url" class="fc" value="${s.fraud_check_api_url||''}" placeholder="https://.../check?phone={phone}"></div>
          <div class="fg"><label>Fraud Checker Bearer Key</label><input name="fraud_check_api_key" class="fc" value="${s.fraud_check_api_key||''}"></div>
          <div class="fg"><label>bKash Number (Manual)</label><input name="bkash_number" class="fc" value="${s.bkash_number||''}"></div>
          <div class="fg"><label>Nagad Number (Manual)</label><input name="nagad_number" class="fc" value="${s.nagad_number||''}"></div>
        </div>
      </div>

      <button class="btn btn-primary" style="padding:12px 24px" type="submit">💾 সব API কনফিগারেশন সেভ করুন</button>
    </form>`;

  document.getElementById('api-settings-form').onsubmit = saveFormSettings;
}

window.generateAppKey = async () => {
  const label = prompt('API Key-এর নাম দিন (যেমন: My Android Admin App):', 'Android Admin App');
  if (!label) return;
  const r = await aapi('/admin/api-keys', { method: 'POST', body: JSON.stringify({ label, role: 'super_admin' }) });
  if (r.ok) {
    document.getElementById('new-key-alert').innerHTML = `
      <div style="background:#f0fdf4;border:2px solid #16a34a;padding:12px;border-radius:10px;margin-bottom:12px">
        <div style="font-weight:700;color:#166534">✅ নতুন Mobile App API Key তৈরি হয়েছে (এখনই কপি করুন):</div>
        <div class="code-box" style="margin-top:6px">${r.raw_key}</div>
      </div>`;
    toast('API Key তৈরি হয়েছে!');
  }
};

// ==================== 8. SITE SETTINGS & CMS PAGES ====================
async function renderSettings(box) {
  document.getElementById('page-title').textContent = '⚙️ সাইট সেটিংস ও পলিসি পেজ';
  const r = await aapi('/admin/settings');
  const s = r.settings || {};
  const pages = r.pages || [];

  box.innerHTML = `
    <form id="site-settings-form" class="panel">
      <h3 style="margin-bottom:12px">🏪 শপ ব্র্যান্ডিং, ডেলিভারি ও থিম</h3>
      <div class="form-grid">
        <div class="fg"><label>ওয়েবসাইটের নাম</label><input name="site_name" class="fc" value="${s.site_name||''}"></div>
        <div class="fg"><label>ট্যাগলাইন</label><input name="site_tagline" class="fc" value="${s.site_tagline||''}"></div>
        <div class="fg"><label>লোগো URL (খালি রাখলে টেক্সট লোগো)</label><input name="logo_url" class="fc" value="${s.logo_url||''}"></div>
        <div class="fg"><label>থিম প্রাইমারি কালার</label><input name="primary_color" type="color" class="fc" style="height:40px" value="${s.primary_color||'#e11d48'}"></div>
        <div class="fg"><label>হেল্পলাইন ফোন</label><input name="helpline_phone" class="fc" value="${s.helpline_phone||''}"></div>
        <div class="fg"><label>WhatsApp নম্বর (88 সহ)</label><input name="whatsapp_number" class="fc" value="${s.whatsapp_number||''}"></div>
        <div class="fg"><label>দোকানের ঠিকানা</label><input name="shop_address" class="fc" value="${s.shop_address||''}"></div>
        <div class="fg"><label>ইমেইল</label><input name="shop_email" class="fc" value="${s.shop_email||''}"></div>
        <div class="fg"><label>ঢাকা সিটিতে ডেলিভারি (৳)</label><input name="delivery_inside_dhaka" type="number" class="fc" value="${s.delivery_inside_dhaka||60}"></div>
        <div class="fg"><label>ঢাকা সাব-এরিয়া ডেলিভারি (৳)</label><input name="delivery_sub_dhaka" type="number" class="fc" value="${s.delivery_sub_dhaka||100}"></div>
        <div class="fg"><label>ঢাকার বাইরে ডেলিভারি (৳)</label><input name="delivery_outside_dhaka" type="number" class="fc" value="${s.delivery_outside_dhaka||120}"></div>
        <div class="fg"><label>কত টাকা অর্ডারে ডেলিভারি ফ্রি (৳)</label><input name="free_delivery_threshold" type="number" class="fc" value="${s.free_delivery_threshold||2000}"></div>
      </div>
      <div class="fg"><label>টপ অ্যানাউন্সমেন্ট বার টেক্সট</label><input name="announcement_text" class="fc" value="${s.announcement_text||''}"></div>
      <button class="btn btn-primary" type="submit">💾 সাইট সেটিংস সেভ করুন</button>
    </form>

    <div class="panel">
      <h3 style="margin-bottom:12px">📄 পলিসি ও তথ্য পেজ এডিটর</h3>
      ${pages.map(pg => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
          <strong>${pg.title_bn || pg.title} (<code>/page.html?slug=${pg.slug}</code>)</strong>
          <textarea id="pg-${pg.slug}" class="fc" rows="3" style="margin:8px 0">${pg.content}</textarea>
          <button class="btn btn-dark btn-sm" onclick="saveCmsPage('${pg.slug}','${pg.title}','${pg.title_bn||''}')">সেভ করুন</button>
        </div>`).join('')}
    </div>`;

  document.getElementById('site-settings-form').onsubmit = saveFormSettings;
}

async function saveFormSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  const r = await aapi('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings: obj }) });
  toast(r.message || r.error);
}

window.saveCmsPage = async (slug, title, title_bn) => {
  const content = document.getElementById('pg-' + slug).value;
  const r = await aapi('/admin/pages/' + slug, { method: 'PUT', body: JSON.stringify({ title, title_bn, content }) });
  if (r.ok) toast('পেজ আপডেট হয়েছে!');
};

window.delRec = async (res, id) => {
  if (!confirm('নিশ্চিত মুছে ফেলবেন?')) return;
  await aapi(`/admin/${res}/${id}`, { method: 'DELETE' });
  loadTab(currentTab);
};

function c(id) { return document.getElementById(id).value; }

bootAdmin();

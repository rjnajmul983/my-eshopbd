// E-ShopBD Complete Cloudflare Pages Worker (_worker.js - Advanced Mode, Root Flat Deploy)
// Handles: /api/*, /api/v1/*, /p/:slug (OpenGraph), /sitemap.xml, /admin -> /admin.html, and static assets.

// ==================== AUTH & CRYPTO ====================
// Web Crypto API Auth Helpers (Zero npm dependencies - 100% Cloudflare Workers native)

const encoder = new TextEncoder();

function base64UrlEncode(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(text) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(String(text || '')));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt = null) {
  const s = salt || base64UrlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const keyMat = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(s), iterations: 50000, hash: 'SHA-256' },
    keyMat,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${s}$${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes('$')) return false;
  const [salt, expected] = stored.split('$');
  const computed = await hashPassword(password, salt);
  return computed === `${salt}$${expected}`;
}

function getJwtSecret(env) {
  return (env && env.JWT_SECRET) ? env.JWT_SECRET : 'eshopbd-default-change-me-in-cf-env-2026';
}

async function signJWT(payload, secret, expiresInSeconds = 60 * 60 * 24 * 30) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const h = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const b = base64UrlEncode(encoder.encode(JSON.stringify(body)));
  const data = `${h}.${b}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${base64UrlEncode(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify('HMAC', key, base64UrlDecode(s), encoder.encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(b)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function authenticateRequest(request, env) {
  const db = env.DB;
  // 1. Check X-API-Key header (for Mobile App / External Integrations)
  const apiKey = request.headers.get('X-API-Key') || new URL(request.url).searchParams.get('api_key');
  if (apiKey && db) {
    const keyHash = await sha256Hex(apiKey.trim());
    const row = await db.prepare('SELECT id, label, role FROM api_keys WHERE key_hash = ? AND is_active = 1').bind(keyHash).first();
    if (row) {
      await db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
      return { id: row.id, name: row.label, role: row.role, via: 'api_key' };
    }
  }
  // 2. Check Authorization: Bearer <JWT>
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const payload = await verifyJWT(token, getJwtSecret(env));
    if (payload) return { ...payload, via: 'jwt' };
  }
  return null;
}

function requireRole(user, allowedRoles = ['super_admin', 'moderator']) {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized: Login or valid API Key required' };
  if (!allowedRoles.includes(user.role)) return { ok: false, status: 403, error: 'Forbidden: Insufficient permissions' };
  return { ok: true };
}

function generateApiKeyString() {
  const raw = base64UrlEncode(crypto.getRandomValues(new Uint8Array(28)));
  return `esbd_live_${raw}`;
}

// ==================== DATABASE SCHEMA & SETTINGS ====================
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', address TEXT DEFAULT '', loyalty_points INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'super_admin', is_active INTEGER DEFAULT 1, last_used_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_bn TEXT DEFAULT '', slug TEXT UNIQUE NOT NULL, image TEXT DEFAULT '', icon TEXT DEFAULT '📦', sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subtitle TEXT DEFAULT '', image TEXT NOT NULL, link TEXT DEFAULT '/', position TEXT DEFAULT 'hero', sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_bn TEXT DEFAULT '', slug TEXT UNIQUE NOT NULL, sku TEXT DEFAULT '', category_id INTEGER, brand TEXT DEFAULT '', buying_price REAL DEFAULT 0, regular_price REAL NOT NULL, sale_price REAL NOT NULL, stock INTEGER DEFAULT 0, images TEXT DEFAULT '[]', video_url TEXT DEFAULT '', short_desc TEXT DEFAULT '', description TEXT DEFAULT '', specs TEXT DEFAULT '[]', variants TEXT DEFAULT '{}', bulk_discount TEXT DEFAULT '{}', landing_content TEXT DEFAULT '{}', is_featured INTEGER DEFAULT 0, is_flash_sale INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sold_count INTEGER DEFAULT 0, rating_avg REAL DEFAULT 5.0, review_count INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL, customer_id INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL, delivery_zone TEXT DEFAULT 'inside_dhaka', subtotal REAL NOT NULL, delivery_charge REAL DEFAULT 0, discount_amount REAL DEFAULT 0, loyalty_discount REAL DEFAULT 0, total_amount REAL NOT NULL, total_cost REAL DEFAULT 0, payment_method TEXT DEFAULT 'cod', payment_status TEXT DEFAULT 'unpaid', payment_sender TEXT DEFAULT '', payment_trx_id TEXT DEFAULT '', coupon_code TEXT DEFAULT '', status TEXT DEFAULT 'pending', courier_name TEXT DEFAULT '', courier_consignment_id TEXT DEFAULT '', courier_tracking_code TEXT DEFAULT '', customer_note TEXT DEFAULT '', admin_note TEXT DEFAULT '', ip_address TEXT DEFAULT '', source TEXT DEFAULT 'website', items_json TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS incomplete_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT UNIQUE NOT NULL, customer_name TEXT DEFAULT '', customer_phone TEXT NOT NULL, customer_address TEXT DEFAULT '', delivery_zone TEXT DEFAULT 'inside_dhaka', items_json TEXT DEFAULT '[]', subtotal REAL DEFAULT 0, ip_address TEXT DEFAULT '', status TEXT DEFAULT 'open', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, type TEXT DEFAULT 'fixed', value REAL NOT NULL, min_order REAL DEFAULT 0, max_discount REAL DEFAULT 0, usage_limit INTEGER DEFAULT 1000, used_count INTEGER DEFAULT 0, expires_at TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT DEFAULT '', rating INTEGER NOT NULL DEFAULT 5, comment TEXT DEFAULT '', image TEXT DEFAULT '', is_approved INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT DEFAULT 'marketing', amount REAL NOT NULL, expense_date TEXT NOT NULL, note TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS blocked_entities (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value TEXT NOT NULL, reason TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(type, value))`,
  `CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, title TEXT NOT NULL, title_bn TEXT DEFAULT '', content TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_incomplete_phone ON incomplete_orders(customer_phone)`
];

const DEFAULT_SETTINGS = {
  site_name: 'E-ShopBD',
  site_tagline: 'বাংলাদেশের বিশ্বস্ত অনলাইন শপিং প্ল্যাটফর্ম',
  logo_url: '',
  primary_color: '#e11d48',
  secondary_color: '#0f172a',
  announcement_text: '🎉 সারা বাংলাদেশে ক্যাশ অন ডেলিভারি! ২০০০৳+ অর্ডারে ডেলিভারি সম্পূর্ণ ফ্রি!',
  helpline_phone: '01700000000',
  whatsapp_number: '8801700000000',
  shop_address: 'House 12, Road 5, Dhanmondi, Dhaka-1205, Bangladesh',
  shop_email: 'support@e-shopbd.com',
  delivery_inside_dhaka: '60',
  delivery_sub_dhaka: '100',
  delivery_outside_dhaka: '120',
  free_delivery_threshold: '2000',
  flash_sale_end: new Date(Date.now() + 3 * 86400000).toISOString(),
  loyalty_earn_rate: '1', // 1 point per 100 BDT
  loyalty_point_value: '1', // 1 point = 1 BDT
  bkash_number: '01700000000 (Personal)',
  nagad_number: '01700000000 (Personal)',
  rocket_number: '',
  cod_enabled: '1',
  manual_mfs_enabled: '1',
  online_gateway_enabled: '0',
  online_gateway_provider: 'uddoktapay',
  online_gateway_url: '',
  online_gateway_api_key: '',
  // Marketing & Pixels
  fb_pixel_id: '',
  fb_capi_token: '',
  fb_capi_test_code: '',
  tiktok_pixel_id: '',
  gtm_id: '',
  // Image Hosting APIs (No Credit Card Required)
  image_provider: 'imgbb', // imgbb | cloudinary | direct
  imgbb_api_key: '',
  cloudinary_cloud_name: '',
  cloudinary_upload_preset: '',
  // Courier APIs
  steadfast_api_key: '',
  steadfast_secret_key: '',
  pathao_client_id: '',
  pathao_client_secret: '',
  pathao_store_id: '',
  pathao_access_token: '',
  redx_access_token: '',
  // Fraud Check API
  fraud_check_api_url: '',
  fraud_check_api_key: '',
  // SMS / WhatsApp Automation API
  sms_enabled: '0',
  sms_api_url: 'https://bulksmsbd.net/api/smsapi',
  sms_api_key: '',
  sms_sender_id: '',
  webhook_order_url: ''
};

const PUBLIC_SETTING_KEYS = [
  'site_name', 'site_tagline', 'logo_url', 'primary_color', 'secondary_color',
  'announcement_text', 'helpline_phone', 'whatsapp_number', 'shop_address', 'shop_email',
  'delivery_inside_dhaka', 'delivery_sub_dhaka', 'delivery_outside_dhaka',
  'free_delivery_threshold', 'flash_sale_end', 'loyalty_earn_rate', 'loyalty_point_value',
  'bkash_number', 'nagad_number', 'rocket_number', 'cod_enabled', 'manual_mfs_enabled',
  'online_gateway_enabled', 'fb_pixel_id', 'tiktok_pixel_id', 'gtm_id'
];

async function getAllSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const map = { ...DEFAULT_SETTINGS };
  for (const r of results || []) map[r.key] = r.value;
  return map;
}

async function getPublicSettings(db) {
  const all = await getAllSettings(db);
  const pub = {};
  for (const k of PUBLIC_SETTING_KEYS) pub[k] = all[k] ?? '';
  return pub;
}

async function initializeDatabase(db, env, seedDemo = true) {
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }

  // Insert default settings if missing
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(k, String(v)).run();
  }

  // Create default Super Admin if no admin exists
  const existingAdmin = await db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").first();
  const adminPhone = (env && env.ADMIN_PHONE) || '01700000000';
  const adminPass = (env && env.ADMIN_PASSWORD) || 'admin1234';
  if (!existingAdmin) {
    const hash = await hashPassword(adminPass);
    await db.prepare(
      "INSERT OR IGNORE INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, 'super_admin')"
    ).bind('Super Admin', adminPhone, 'admin@e-shopbd.com', hash).run();
  }

  // Seed default policy pages
  const defaultPages = [
    ['about-us', 'About Us', 'আমাদের সম্পর্কে', '<h3>আমাদের সম্পর্কে</h3><p>আমরা বাংলাদেশের নির্ভরযোগ্য অনলাইন শপিং প্ল্যাটফর্ম। ১০০% অরিজিনাল পণ্য, দ্রুত হোম ডেলিভারি এবং সহজ রিটার্ন পলিসির মাধ্যমে আমরা গ্রাহকদের সর্বোচ্চ সন্তুষ্টি নিশ্চিত করি।</p>'],
    ['return-policy', 'Return & Refund Policy', 'রিটার্ন ও রিফান্ড পলিসি', '<h3>রিটার্ন ও রিফান্ড পলিসি</h3><ul><li>পণ্য রিসিভ করার সময় ডেলিভারি ম্যানের সামনে চেক করে নিন।</li><li>কোনো ত্রুটি বা ভুল পণ্য পেলে ৭ দিনের মধ্যে এক্সচেঞ্জ বা ফুল রিফান্ড।</li><li>রিফান্ড ৩–৫ কর্মদিবসের মধ্যে bKash/Nagad/ব্যাংকে প্রদান করা হয়।</li></ul>'],
    ['privacy-policy', 'Privacy Policy', 'প্রাইভেসি পলিসি', '<h3>প্রাইভেসি পলিসি</h3><p>আপনার নাম, মোবাইল নম্বর এবং ঠিকানা শুধুমাত্র অর্ডার প্রসেস ও ডেলিভারির কাজে ব্যবহৃত হয়। আমরা কোনো তৃতীয় পক্ষের কাছে গ্রাহকের তথ্য বিক্রি করি না।</p>'],
    ['terms', 'Terms & Conditions', 'শর্তাবলী', '<h3>শর্তাবলী</h3><p>অর্ডার কনফার্ম করার আগে প্রোডাক্টের বিবরণ ও ডেলিভারি চার্জ দেখে নিন। ফেক অর্ডার প্রতিরোধে আমাদের অটোমেটেড ভেরিফিকেশন সিস্টেম চালু আছে।</p>'],
    ['contact', 'Contact & Store Location', 'যোগাযোগ ও শোরুম', '<h3>যোগাযোগ করুন</h3><p>যেকোনো অর্ডার বা সহায়তার জন্য আমাদের হেল্পলাইনে কল অথবা হোয়াটসঅ্যাপ করুন। প্রতিদিন সকাল ৯টা থেকে রাত ১১টা পর্যন্ত কাস্টমার কেয়ার খোলা থাকে।</p>']
  ];
  for (const [slug, title, title_bn, content] of defaultPages) {
    await db.prepare('INSERT OR IGNORE INTO pages (slug, title, title_bn, content) VALUES (?, ?, ?, ?)').bind(slug, title, title_bn, content).run();
  }

  if (seedDemo) {
    const prodCount = await db.prepare('SELECT COUNT(*) as c FROM products').first();
    if (!prodCount || prodCount.c === 0) {
      const cats = [
        ['Smart Watches', 'স্মার্টওয়াচ', 'smart-watches', '⌚', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', 1],
        ['Headphones & Audio', 'হেডফোন ও অডিও', 'audio-gadgets', '🎧', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', 2],
        ['Fashion & Panjabi', 'ফ্যাশন ও পাঞ্জাবি', 'fashion', '👕', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400', 3],
        ['Home & Kitchen', 'হোম ও কিচেন', 'home-kitchen', '🏠', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400', 4],
        ['Beauty & Care', 'বিউটি ও কেয়ার', 'beauty-care', '✨', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400', 5],
        ['Mobile Accessories', 'মোবাইল এক্সেসরিজ', 'mobile-accessories', '🔌', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400', 6]
      ];
      for (const [n, nb, s, ic, img, so] of cats) {
        await db.prepare('INSERT OR IGNORE INTO categories (name, name_bn, slug, icon, image, sort_order) VALUES (?, ?, ?, ?, ?, ?)').bind(n, nb, s, ic, img, so).run();
      }

      const banners = [
        ['মেগা ফ্ল্যাশ সেল — ৫০% পর্যন্ত ছাড়!', 'সারা বাংলাদেশে দ্রুত হোম ডেলিভারি ও ক্যাশ অন ডেলিভারি', 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200', '/?flash=1', 'hero', 1],
        ['প্রিমিয়াম গ্যাজেট ও স্মার্টওয়াচ কালেকশন', 'অফিশিয়াল ওয়ারেন্টিসহ অরিজিনাল প্রোডাক্ট এখন সেরা দামে', 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200', '/?cat=smart-watches', 'hero', 2]
      ];
      for (const [t, sub, img, lnk, pos, so] of banners) {
        await db.prepare('INSERT INTO banners (title, subtitle, image, link, position, sort_order) VALUES (?, ?, ?, ?, ?, ?)').bind(t, sub, img, lnk, pos, so).run();
      }

      const catRows = (await db.prepare('SELECT id, slug FROM categories').all()).results || [];
      const catId = slug => (catRows.find(c => c.slug === slug) || { id: 1 }).id;

      const demoProducts = [
        {
          name: 'Ultra Pro AMOLED Bluetooth Calling Smart Watch',
          name_bn: 'আল্ট্রা প্রো অ্যামোলেড ব্লুটুথ কলিং স্মার্টওয়াচ',
          slug: 'ultra-pro-amoled-smart-watch',
          sku: 'SW-101',
          category_id: catId('smart-watches'),
          brand: 'HK Pro',
          buying_price: 1150, regular_price: 2600, sale_price: 1690, stock: 45,
          images: JSON.stringify([
            'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800',
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'
          ]),
          short_desc: '2.02" Super AMOLED Display, Bluetooth Calling, 7 Days Battery, Waterproof IP68',
          description: '<p>প্রিমিয়াম মেটাল বডি ও ক্রিস্টাল ক্লিয়ার AMOLED ডিসপ্লে সমৃদ্ধ স্মার্টওয়াচ। সরাসরি ঘড়ি থেকেই কল রিসিভ, হার্ট রেট মনিটরিং এবং নোটিফিকেশন দেখুন।</p>',
          specs: JSON.stringify([{ key: 'Display', value: '2.02" Super AMOLED' }, { key: 'Battery', value: '380mAh (5-7 Days)' }, { key: 'Waterproof', value: 'IP68' }, { key: 'Warranty', value: '6 Months Replacement' }]),
          variants: JSON.stringify({ colors: ['Black', 'Silver', 'Orange'], sizes: ['49mm'] }),
          bulk_discount: JSON.stringify({ min_qty: 2, discount_amount: 150 }),
          landing_content: JSON.stringify({
            headline: 'হাতে মানাবে প্রিমিয়াম লুক — Ultra Pro AMOLED স্মার্টওয়াচ এখন ৩৫% ছাড়ে!',
            bullets: ['সরাসরি ব্লুটুথ কলিং ও WhatsApp নোটিফিকেশন', 'এক চার্জে ৫–৭ দিন ব্যাটারি ব্যাকআপ', 'বিনামূল্যে ১টি এক্সট্রা সিলিকন স্ট্র্যাপ ফ্রি', 'ডেলিভারি ম্যানের সামনে চেক করে নেওয়ার সুবিধা'],
            offer_note: 'আজকের মধ্যে ২টি অর্ডার করলে অতিরিক্ত ১৫০ টাকা ডিসকাউন্ট!'
          }),
          is_featured: 1, is_flash_sale: 1, sold_count: 142
        },
        {
          name: 'ANC Wireless Noise Cancelling Earbuds Pro',
          name_bn: 'এএনসি ওয়্যারলেস নয়েজ ক্যান্সেলিং ইয়ারবাডস প্রো',
          slug: 'anc-wireless-earbuds-pro',
          sku: 'AU-202',
          category_id: catId('audio-gadgets'),
          brand: 'SoundCore',
          buying_price: 850, regular_price: 1950, sale_price: 1290, stock: 38,
          images: JSON.stringify([
            'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800',
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'
          ]),
          short_desc: 'Active Noise Cancellation, 36H Total Playtime, Low Latency Gaming Mode',
          description: '<p>ডিপ বেস ও অ্যাক্টিভ নয়েজ ক্যান্সেলেশনসহ প্রিমিয়াম TWS ইয়ারবাডস। গেমিং, মিউজিক এবং ক্লিয়ার কল কোয়ালিটির জন্য সেরা।</p>',
          specs: JSON.stringify([{ key: 'Bluetooth', value: '5.3 Low Latency' }, { key: 'Playtime', value: '36 Hours with Case' }, { key: 'Charging', value: 'USB-C Fast Charge' }]),
          variants: JSON.stringify({ colors: ['White', 'Matte Black'], sizes: [] }),
          bulk_discount: JSON.stringify({ min_qty: 2, discount_amount: 100 }),
          landing_content: JSON.stringify({
            headline: 'বাইরের শব্দ ভুলে যান — অরিজিনাল ANC ইয়ারবাডস প্রো!',
            bullets: ['৪২ dB অ্যাক্টিভ নয়েজ ক্যান্সেলেশন', 'টানা ৩৬ ঘণ্টা ব্যাটারি ব্যাকআপ', 'গেমিংয়ের জন্য জিরো ল্যাগ মোড'],
            offer_note: 'ক্যাশ অন ডেলিভারি — অগ্রিম ১ টাকাও দিতে হবে না!'
          }),
          is_featured: 1, is_flash_sale: 1, sold_count: 98
        },
        {
          name: 'Premium Export Cotton Casual Polo Combo (3 Pcs)',
          name_bn: 'প্রিমিয়াম এক্সপোর্ট কটন পোলো টি-শার্ট কম্বো (৩ পিস)',
          slug: 'premium-cotton-polo-combo-3pcs',
          sku: 'FS-303',
          category_id: catId('fashion'),
          brand: 'Dhaka Loom',
          buying_price: 680, regular_price: 1650, sale_price: 1150, stock: 60,
          images: JSON.stringify([
            'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
            'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800'
          ]),
          short_desc: '100% Combed Cotton, 220 GSM Breathable Fabric, Color Guaranteed',
          description: '<p>গরমের আরামদায়ক ১০০% এক্সপোর্ট কোয়ালিটি কটন পোলো কম্বো। রঙ ও কাপড়ের মানের শতভাগ গ্যারান্টি।</p>',
          specs: JSON.stringify([{ key: 'Fabric', value: '100% Combed Cotton (220 GSM)' }, { key: 'Combo', value: '3 Colors Pack' }]),
          variants: JSON.stringify({ colors: ['Black+Navy+Maroon', 'Olive+White+Grey'], sizes: ['M', 'L', 'XL', 'XXL'] }),
          bulk_discount: JSON.stringify({ min_qty: 2, discount_amount: 120 }),
          landing_content: JSON.stringify({
            headline: 'মাত্র ১১৫০ টাকায় ৩ পিস প্রিমিয়াম এক্সপোর্ট পোলো টি-শার্ট!',
            bullets: ['২২০ জিএসএম ১০০% কটন ফেব্রিক', 'রঙ ওঠা বা ববলিন হওয়ার কোনো ভয় নেই', 'সাইজ না মিললে সহজ এক্সচেঞ্জ'],
            offer_note: 'সীমিত সময়ের কম্বো অফার!'
          }),
          is_featured: 1, is_flash_sale: 0, sold_count: 215
        },
        {
          name: 'Electric Mini Chopper & Wireless Garlic Grinder',
          name_bn: 'ইলেকট্রিক মিনি চপার ও রিচার্জেবল মসলা গ্রাইন্ডার',
          slug: 'electric-mini-chopper-grinder',
          sku: 'HK-404',
          category_id: catId('home-kitchen'),
          brand: 'KitchenPro',
          buying_price: 380, regular_price: 950, sale_price: 590, stock: 4,
          images: JSON.stringify([
            'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800'
          ]),
          short_desc: '250ml USB Rechargeable, 3 Stainless Steel Blades, 1-Button Chopping',
          description: '<p>মাত্র ১০ সেকেন্ডে পেঁয়াজ, রসুন, আদা, মরিচ ও সবজি কুচি করুন। USB রিচার্জেবল হওয়ায় কারেন্ট না থাকলেও ব্যবহার করা যাবে।</p>',
          specs: JSON.stringify([{ key: 'Capacity', value: '250 ml' }, { key: 'Blades', value: '304 Stainless Steel' }]),
          variants: JSON.stringify({ colors: ['Green', 'White', 'Pink'], sizes: [] }),
          bulk_discount: JSON.stringify({ min_qty: 2, discount_amount: 80 }),
          landing_content: JSON.stringify({}),
          is_featured: 1, is_flash_sale: 1, sold_count: 175
        },
        {
          name: '20000mAh 22.5W Super Fast Charging Power Bank',
          name_bn: '২০০০০ এমএএইচ ২২.৫ ওয়াট ফাস্ট চার্জিং পাওয়ার ব্যাংক',
          slug: '20000mah-fast-charging-power-bank',
          sku: 'MA-505',
          category_id: catId('mobile-accessories'),
          brand: 'Baseus',
          buying_price: 1200, regular_price: 2450, sale_price: 1790, stock: 22,
          images: JSON.stringify([
            'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800'
          ]),
          short_desc: 'Digital LED Display, Built-in Type-C & Lightning Cables, 22.5W PD Fast Charge',
          description: '<p>ডিজিটাল পার্সেন্টেজ ডিসপ্লে এবং বিল্ট-ইন ক্যাবলসহ অরিজিনাল ২০০০০mAh পাওয়ার ব্যাংক। একসাথে ৩টি ডিভাইস চার্জ করুন।</p>',
          specs: JSON.stringify([{ key: 'Capacity', value: '20,000 mAh' }, { key: 'Output', value: '22.5W PD / QC 3.0' }]),
          variants: JSON.stringify({ colors: ['Black', 'White'], sizes: [] }),
          bulk_discount: JSON.stringify({}),
          landing_content: JSON.stringify({}),
          is_featured: 1, is_flash_sale: 0, sold_count: 64
        }
      ];

      for (const p of demoProducts) {
        await db.prepare(`
          INSERT OR IGNORE INTO products
          (name, name_bn, slug, sku, category_id, brand, buying_price, regular_price, sale_price, stock, images, short_desc, description, specs, variants, bulk_discount, landing_content, is_featured, is_flash_sale, sold_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          p.name, p.name_bn, p.slug, p.sku, p.category_id, p.brand,
          p.buying_price, p.regular_price, p.sale_price, p.stock, p.images,
          p.short_desc, p.description, p.specs, p.variants, p.bulk_discount,
          p.landing_content, p.is_featured, p.is_flash_sale, p.sold_count
        ).run();
      }

      // Demo coupon
      await db.prepare(
        "INSERT OR IGNORE INTO coupons (code, type, value, min_order, max_discount, is_active) VALUES ('WELCOME100', 'fixed', 100, 1000, 100, 1)"
      ).run();

      // Demo review
      const firstProd = await db.prepare('SELECT id FROM products LIMIT 1').first();
      if (firstProd) {
        await db.prepare(
          "INSERT INTO reviews (product_id, customer_name, rating, comment, is_approved) VALUES (?, 'তানভীর আহমেদ', 5, 'অসাধারণ প্রোডাক্ট! যেমন ছবিতে দেখেছি ঠিক তেমনই পেয়েছি। ডেলিভারিও খুব দ্রুত ছিল।', 1)"
        ).bind(firstProd.id).run();
        await db.prepare('UPDATE products SET review_count = 1, rating_avg = 5.0 WHERE id = ?').bind(firstProd.id).run();
      }
    }
  }

  return { ok: true, admin_phone: adminPhone };
}

// ==================== INTEGRATIONS (FB CAPI, COURIER, FRAUD, SMS) ====================
// 1. Facebook Conversions API (Server-Side CAPI)
async function sendFacebookCAPI(settings, eventName, eventData = {}, request = null) {
  try {
    const pixelId = settings.fb_pixel_id;
    const token = settings.fb_capi_token;
    if (!pixelId || !token) return { skipped: true };

    const userData = {};
    if (eventData.phone) {
      let cleanPhone = String(eventData.phone).replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('01')) cleanPhone = '88' + cleanPhone;
      userData.ph = [await sha256Hex(cleanPhone)];
    }
    if (eventData.name) {
      userData.fn = [await sha256Hex(String(eventData.name).trim().toLowerCase())];
    }
    if (request) {
      userData.client_ip_address = request.headers.get('CF-Connecting-IP') || '';
      userData.client_user_agent = request.headers.get('User-Agent') || '';
    }

    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventData.event_id || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action_source: 'website',
        event_source_url: eventData.url || (request ? request.headers.get('Referer') : ''),
        user_data: userData,
        custom_data: {
          currency: 'BDT',
          value: Number(eventData.value || 0),
          content_ids: eventData.content_ids || [],
          content_type: 'product',
          num_items: Number(eventData.num_items || 1)
        }
      }]
    };
    if (settings.fb_capi_test_code) payload.test_event_code = settings.fb_capi_test_code;

    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

// 2. Steadfast Courier Booking API
async function bookSteadfast(settings, order) {
  if (!settings.steadfast_api_key || !settings.steadfast_secret_key) {
    return { ok: false, error: 'Steadfast API Key & Secret Key সেটিংসে কনফিগার করা নেই।' };
  }
  const codAmount = order.payment_status === 'paid' ? 0 : Math.round(Number(order.total_amount));
  const res = await fetch('https://portal.packzy.com/api/v1/create_order', {
    method: 'POST',
    headers: {
      'Api-Key': settings.steadfast_api_key,
      'Secret-Key': settings.steadfast_secret_key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      invoice: order.order_number,
      recipient_name: order.customer_name,
      recipient_phone: order.customer_phone,
      recipient_address: order.customer_address,
      cod_amount: codAmount,
      note: order.customer_note || order.admin_note || ''
    })
  });
  const data = await res.json();
  if (data && data.status === 200 && data.consignment) {
    return {
      ok: true,
      courier_name: 'Steadfast',
      consignment_id: String(data.consignment.consignment_id),
      tracking_code: String(data.consignment.tracking_code || data.consignment.consignment_id),
      raw: data
    };
  }
  return { ok: false, error: data.message || 'Steadfast API error', raw: data };
}

// 3. Pathao Courier Booking API
async function bookPathao(settings, order) {
  if (!settings.pathao_access_token || !settings.pathao_store_id) {
    return { ok: false, error: 'Pathao Access Token এবং Store ID সেটিংসে কনফিগার করা নেই।' };
  }
  const codAmount = order.payment_status === 'paid' ? 0 : Math.round(Number(order.total_amount));
  const res = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.pathao_access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      store_id: Number(settings.pathao_store_id),
      merchant_order_id: order.order_number,
      recipient_name: order.customer_name,
      recipient_phone: order.customer_phone,
      recipient_address: order.customer_address,
      delivery_type: 48,
      item_type: 2,
      item_quantity: 1,
      item_weight: 0.5,
      amount_to_collect: codAmount,
      special_instruction: order.customer_note || ''
    })
  });
  const data = await res.json();
  if (data && data.data && data.data.consignment_id) {
    return {
      ok: true,
      courier_name: 'Pathao',
      consignment_id: String(data.data.consignment_id),
      tracking_code: String(data.data.consignment_id),
      raw: data
    };
  }
  return { ok: false, error: data.message || 'Pathao API error', raw: data };
}

// 4. RedX Courier Booking API
async function bookRedX(settings, order) {
  if (!settings.redx_access_token) {
    return { ok: false, error: 'RedX Access Token সেটিংসে কনফিগার করা নেই।' };
  }
  const codAmount = order.payment_status === 'paid' ? 0 : Math.round(Number(order.total_amount));
  const res = await fetch('https://openapi.redx.com.bd/v1.0.0-beta/parcel', {
    method: 'POST',
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${settings.redx_access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      delivery_area: order.delivery_zone === 'inside_dhaka' ? 'Dhaka' : 'Outside Dhaka',
      delivery_area_id: 1,
      customer_address: order.customer_address,
      merchant_invoice_id: order.order_number,
      cash_collection_amount: codAmount,
      parcel_weight: 500,
      instruction: order.customer_note || ''
    })
  });
  const data = await res.json();
  if (data && data.tracking_id) {
    return {
      ok: true,
      courier_name: 'RedX',
      consignment_id: String(data.tracking_id),
      tracking_code: String(data.tracking_id),
      raw: data
    };
  }
  return { ok: false, error: data.message || 'RedX API error', raw: data };
}

// 5. Fraud Check (Internal DB History + Optional External BD Courier Fraud Checker API)
async function checkCustomerFraud(db, settings, phone) {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  const internal = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status IN ('cancelled', 'returned') THEN 1 ELSE 0 END) as cancelled
    FROM orders WHERE customer_phone = ?
  `).bind(clean).first();

  const blocked = await db.prepare("SELECT id, reason FROM blocked_entities WHERE type = 'phone' AND value = ?").bind(clean).first();

  let external = null;
  if (settings.fraud_check_api_url) {
    try {
      const url = settings.fraud_check_api_url.replace('{phone}', encodeURIComponent(clean));
      const headers = { 'Accept': 'application/json' };
      if (settings.fraud_check_api_key) headers['Authorization'] = `Bearer ${settings.fraud_check_api_key}`;
      const res = await fetch(url, { headers });
      external = await res.json();
    } catch (e) {
      external = { error: e.message };
    }
  }

  const total = Number(internal?.total || 0);
  const delivered = Number(internal?.delivered || 0);
  const cancelled = Number(internal?.cancelled || 0);
  const ratio = total > 0 ? Math.round((delivered / total) * 100) : 100;

  let risk = 'low';
  if (blocked || cancelled >= 2 || (total >= 3 && ratio < 50)) risk = 'high';
  else if (cancelled === 1) risk = 'medium';

  return {
    phone: clean,
    is_blocked: Boolean(blocked),
    block_reason: blocked?.reason || '',
    risk_level: risk,
    internal_history: { total, delivered, cancelled, success_rate: ratio },
    external_courier_data: external
  };
}

// 6. Automated SMS & Webhook Notification
async function sendOrderNotification(settings, order, messageText) {
  const results = {};
  if (settings.sms_enabled === '1' && settings.sms_api_url && settings.sms_api_key) {
    try {
      const url = `${settings.sms_api_url}?api_key=${encodeURIComponent(settings.sms_api_key)}&type=text&number=${encodeURIComponent(order.customer_phone)}&senderid=${encodeURIComponent(settings.sms_sender_id || '')}&message=${encodeURIComponent(messageText)}`;
      const res = await fetch(url);
      results.sms = await res.text();
    } catch (e) {
      results.sms_error = e.message;
    }
  }
  if (settings.webhook_order_url) {
    try {
      const res = await fetch(settings.webhook_order_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'order_update', order, message: messageText })
      });
      results.webhook = res.status;
    } catch (e) {
      results.webhook_error = e.message;
    }
  }
  return results;
}

// ==================== PUBLIC STOREFRONT ROUTES ====================
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function parseJsonSafe(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function formatProduct(p) {
  if (!p) return null;
  return {
    ...p,
    images: parseJsonSafe(p.images, []),
    specs: parseJsonSafe(p.specs, []),
    variants: parseJsonSafe(p.variants, { colors: [], sizes: [] }),
    bulk_discount: parseJsonSafe(p.bulk_discount, {}),
    landing_content: parseJsonSafe(p.landing_content, {}),
    discount_percent: p.regular_price > p.sale_price
      ? Math.round(((p.regular_price - p.sale_price) / p.regular_price) * 100)
      : 0
  };
}

async function handlePublicRoutes(method, subpath, request, env, ctx) {
  const db = env.DB;
  const url = new URL(request.url);

  // GET /api/health
  if (method === 'GET' && subpath === '/health') {
    let dbReady = false;
    try {
      await db.prepare('SELECT 1 FROM settings LIMIT 1').first();
      dbReady = true;
    } catch { dbReady = false; }
    return json({ ok: true, service: 'E-ShopBD API v1', db_bound: Boolean(db), db_initialized: dbReady, time: new Date().toISOString() });
  }

  // GET /api/store/bootstrap (single fast call for initial load)
  if (method === 'GET' && subpath === '/store/bootstrap') {
    try {
      const [settings, categories, banners, featured, flashSale, latest] = await Promise.all([
        getPublicSettings(db),
        db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all(),
        db.prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id DESC').all(),
        db.prepare('SELECT * FROM products WHERE is_active = 1 AND is_featured = 1 ORDER BY sold_count DESC, id DESC LIMIT 12').all(),
        db.prepare('SELECT * FROM products WHERE is_active = 1 AND is_flash_sale = 1 ORDER BY id DESC LIMIT 8').all(),
        db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY id DESC LIMIT 16').all()
      ]);
      return json({
        ok: true,
        settings,
        categories: categories.results || [],
        banners: banners.results || [],
        featured: (featured.results || []).map(formatProduct),
        flash_sale: (flashSale.results || []).map(formatProduct),
        latest: (latest.results || []).map(formatProduct)
      });
    } catch (e) {
      return json({ ok: false, needs_setup: true, error: 'Database not initialized yet. Visit /admin/ to run 1-Click Setup.', detail: e.message }, 503);
    }
  }

  // GET /api/settings
  if (method === 'GET' && subpath === '/settings') {
    return json({ ok: true, settings: await getPublicSettings(db) });
  }

  // GET /api/categories
  if (method === 'GET' && subpath === '/categories') {
    const { results } = await db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
    return json({ ok: true, categories: results || [] });
  }

  // GET /api/products (with full search, category, brand, price range, in_stock, flash, sort, pagination)
  if (method === 'GET' && subpath === '/products') {
    const q = (url.searchParams.get('q') || '').trim();
    const cat = (url.searchParams.get('category') || '').trim();
    const brand = (url.searchParams.get('brand') || '').trim();
    const minPrice = Number(url.searchParams.get('min_price') || 0);
    const maxPrice = Number(url.searchParams.get('max_price') || 0);
    const inStock = url.searchParams.get('in_stock') === '1';
    const flash = url.searchParams.get('flash') === '1';
    const featured = url.searchParams.get('featured') === '1';
    const sort = url.searchParams.get('sort') || 'latest';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') || 24)));
    const offset = (page - 1) * limit;

    let where = ['p.is_active = 1'];
    let binds = [];

    if (q) {
      where.push('(p.name LIKE ? OR p.name_bn LIKE ? OR p.brand LIKE ? OR p.sku LIKE ? OR p.short_desc LIKE ?)');
      const like = `%${q}%`;
      binds.push(like, like, like, like, like);
    }
    if (cat) {
      if (/^\d+$/.test(cat)) {
        where.push('p.category_id = ?');
        binds.push(Number(cat));
      } else {
        where.push('c.slug = ?');
        binds.push(cat);
      }
    }
    if (brand) { where.push('LOWER(p.brand) = LOWER(?)'); binds.push(brand); }
    if (minPrice > 0) { where.push('p.sale_price >= ?'); binds.push(minPrice); }
    if (maxPrice > 0) { where.push('p.sale_price <= ?'); binds.push(maxPrice); }
    if (inStock) where.push('p.stock > 0');
    if (flash) where.push('p.is_flash_sale = 1');
    if (featured) where.push('p.is_featured = 1');

    let orderBy = 'p.id DESC';
    if (sort === 'price_asc') orderBy = 'p.sale_price ASC';
    else if (sort === 'price_desc') orderBy = 'p.sale_price DESC';
    else if (sort === 'best_selling') orderBy = 'p.sold_count DESC, p.id DESC';
    else if (sort === 'rating') orderBy = 'p.rating_avg DESC, p.review_count DESC';

    const whereClause = where.join(' AND ');
    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${whereClause}`
    ).bind(...binds).first();

    const rows = await db.prepare(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all();

    const brandsRow = await db.prepare("SELECT DISTINCT brand FROM products WHERE is_active = 1 AND brand != '' ORDER BY brand ASC").all();

    return json({
      ok: true,
      total: countRow?.total || 0,
      page,
      limit,
      brands: (brandsRow.results || []).map(b => b.brand),
      products: (rows.results || []).map(formatProduct)
    });
  }

  // GET /api/products/:slug
  if (method === 'GET' && subpath.startsWith('/products/')) {
    const slugOrId = decodeURIComponent(subpath.replace('/products/', '').split('/')[0]);
    const isId = /^\d+$/.test(slugOrId);
    const prod = await db.prepare(
      `SELECT p.*, c.name as category_name, c.name_bn as category_name_bn, c.slug as category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${isId ? 'p.id = ?' : 'p.slug = ?'} AND p.is_active = 1`
    ).bind(isId ? Number(slugOrId) : slugOrId).first();

    if (!prod) return json({ ok: false, error: 'Product not found' }, 404);

    const [reviews, related] = await Promise.all([
      db.prepare('SELECT * FROM reviews WHERE product_id = ? AND is_approved = 1 ORDER BY id DESC LIMIT 30').bind(prod.id).all(),
      db.prepare('SELECT * FROM products WHERE is_active = 1 AND category_id = ? AND id != ? ORDER BY sold_count DESC LIMIT 6').bind(prod.category_id, prod.id).all()
    ]);

    return json({
      ok: true,
      product: formatProduct(prod),
      reviews: reviews.results || [],
      related: (related.results || []).map(formatProduct)
    });
  }

  // POST /api/reviews
  if (method === 'POST' && subpath === '/reviews') {
    const body = await request.json();
    const productId = Number(body.product_id);
    const name = String(body.customer_name || '').trim();
    const rating = Math.min(5, Math.max(1, Number(body.rating || 5)));
    const comment = String(body.comment || '').trim();
    const image = String(body.image || '').trim();
    if (!productId || !name || !comment) return json({ ok: false, error: 'নাম ও রিভিউ লিখুন।' }, 400);

    await db.prepare(
      'INSERT INTO reviews (product_id, customer_name, customer_phone, rating, comment, image, is_approved) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).bind(productId, name, String(body.customer_phone || ''), rating, comment, image).run();

    const agg = await db.prepare('SELECT COUNT(*) as cnt, AVG(rating) as avg_r FROM reviews WHERE product_id = ? AND is_approved = 1').bind(productId).first();
    await db.prepare('UPDATE products SET review_count = ?, rating_avg = ? WHERE id = ?')
      .bind(agg.cnt || 0, Number((agg.avg_r || 5).toFixed(1)), productId).run();

    return json({ ok: true, message: 'আপনার রিভিউয়ের জন্য ধন্যবাদ!' });
  }

  // POST /api/coupons/validate
  if (method === 'POST' && subpath === '/coupons/validate') {
    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const subtotal = Number(body.subtotal || 0);
    const c = await db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1').bind(code).first();
    if (!c) return json({ ok: false, error: 'কুপন কোডটি সঠিক নয়।' }, 404);
    if (c.expires_at && new Date(c.expires_at) < new Date()) return json({ ok: false, error: 'কুপনটির মেয়াদ শেষ হয়ে গেছে।' }, 400);
    if (c.usage_limit && c.used_count >= c.usage_limit) return json({ ok: false, error: 'কুপন ব্যবহারের সীমা শেষ।' }, 400);
    if (subtotal < c.min_order) return json({ ok: false, error: `এই কুপন ব্যবহারের জন্য কমপক্ষে ৳${c.min_order} অর্ডার করতে হবে।` }, 400);

    let discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Number(c.value);
    if (c.max_discount > 0) discount = Math.min(discount, c.max_discount);
    discount = Math.min(discount, subtotal);
    return json({ ok: true, coupon: { code: c.code, type: c.type, value: c.value }, discount });
  }

  // POST /api/incomplete-orders (Auto-capture abandoned checkout leads)
  if (method === 'POST' && subpath === '/incomplete-orders') {
    const body = await request.json();
    const phone = String(body.customer_phone || '').replace(/[^0-9]/g, '');
    if (phone.length < 10) return json({ ok: false, ignored: true });
    const sessionId = String(body.session_id || `sess_${phone}`);
    const ip = request.headers.get('CF-Connecting-IP') || '';

    await db.prepare(`
      INSERT INTO incomplete_orders (session_id, customer_name, customer_phone, customer_address, delivery_zone, items_json, subtotal, ip_address, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        customer_address = excluded.customer_address,
        delivery_zone = excluded.delivery_zone,
        items_json = excluded.items_json,
        subtotal = excluded.subtotal,
        status = 'open',
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      sessionId,
      String(body.customer_name || '').trim(),
      phone,
      String(body.customer_address || '').trim(),
      String(body.delivery_zone || 'inside_dhaka'),
      JSON.stringify(body.items || []),
      Number(body.subtotal || 0),
      ip
    ).run();

    return json({ ok: true });
  }

  // POST /api/orders (Place Order with Fraud Shield, Rate Limit, Bulk Discount, Coupon, Loyalty, CAPI)
  if (method === 'POST' && subpath === '/orders') {
    const body = await request.json();
    const settings = await getAllSettings(db);
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';

    const name = String(body.customer_name || '').trim();
    const phone = String(body.customer_phone || '').replace(/[^0-9]/g, '');
    const address = String(body.customer_address || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!name || phone.length < 11 || !address || items.length === 0) {
      return json({ ok: false, error: 'অনুগ্রহ করে নাম, ১১ ডিজিটের মোবাইল নম্বর, সম্পূর্ণ ঠিকানা ও প্রোডাক্ট দিন।' }, 400);
    }

    // Fraud Shield: Check banned phone or IP
    const blocked = await db.prepare(
      "SELECT id, reason FROM blocked_entities WHERE (type = 'phone' AND value = ?) OR (type = 'ip' AND value = ?) LIMIT 1"
    ).bind(phone, ip).first();
    if (blocked) {
      return json({ ok: false, error: 'দুঃখিত, এই নম্বর বা ডিভাইস থেকে অর্ডার করা সাময়িকভাবে বন্ধ আছে। হেল্পলাইনে যোগাযোগ করুন।' }, 403);
    }

    // Rate Limit: Prevent duplicate spam orders within 3 minutes from same phone/IP
    const recent = await db.prepare(
      "SELECT id FROM orders WHERE (customer_phone = ? OR ip_address = ?) AND created_at >= datetime('now', '-3 minutes') LIMIT 1"
    ).bind(phone, ip).first();
    if (recent && !body.bypass_rate_limit) {
      return json({ ok: false, error: 'আপনি একটু আগেই একটি অর্ডার করেছেন। নতুন অর্ডারের জন্য ৩ মিনিট অপেক্ষা করুন।' }, 429);
    }

    // Validate products & compute authoritative totals from DB
    let subtotal = 0;
    let totalCost = 0;
    let bulkSavings = 0;
    const verifiedItems = [];

    for (const it of items) {
      const prod = await db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').bind(Number(it.product_id || it.id)).first();
      if (!prod) continue;
      const qty = Math.max(1, Math.min(50, Number(it.qty || 1)));
      const unitPrice = Number(prod.sale_price);
      let lineTotal = unitPrice * qty;

      const bulk = parseJsonSafe(prod.bulk_discount, {});
      if (bulk.min_qty && qty >= Number(bulk.min_qty) && bulk.discount_amount) {
        bulkSavings += Number(bulk.discount_amount);
      }

      subtotal += lineTotal;
      totalCost += Number(prod.buying_price || 0) * qty;
      const imgs = parseJsonSafe(prod.images, []);
      verifiedItems.push({
        product_id: prod.id,
        name: prod.name,
        slug: prod.slug,
        sku: prod.sku,
        image: imgs[0] || '',
        price: unitPrice,
        buying_price: Number(prod.buying_price || 0),
        qty,
        variant: it.variant || ''
      });
    }

    if (verifiedItems.length === 0) return json({ ok: false, error: 'কার্টে কোনো বৈধ প্রোডাক্ট নেই।' }, 400);

    // Delivery charge calculation
    const zone = body.delivery_zone || 'inside_dhaka';
    let deliveryCharge = Number(settings.delivery_inside_dhaka || 60);
    if (zone === 'sub_dhaka') deliveryCharge = Number(settings.delivery_sub_dhaka || 100);
    else if (zone === 'outside_dhaka') deliveryCharge = Number(settings.delivery_outside_dhaka || 120);

    const freeThresh = Number(settings.free_delivery_threshold || 0);
    if (freeThresh > 0 && subtotal >= freeThresh) deliveryCharge = 0;

    // Coupon discount
    let couponDiscount = 0;
    let couponCode = '';
    if (body.coupon_code) {
      const code = String(body.coupon_code).trim().toUpperCase();
      const c = await db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1').bind(code).first();
      if (c && subtotal >= c.min_order && (!c.usage_limit || c.used_count < c.usage_limit)) {
        couponDiscount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Number(c.value);
        if (c.max_discount > 0) couponDiscount = Math.min(couponDiscount, c.max_discount);
        couponCode = c.code;
        await db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').bind(c.id).run();
      }
    }

    // Logged-in customer & loyalty points redeem
    const authUser = await authenticateRequest(request, env);
    let customerId = null;
    let loyaltyDiscount = 0;
    if (authUser && authUser.id) {
      const u = await db.prepare('SELECT id, loyalty_points FROM users WHERE id = ?').bind(authUser.id).first();
      if (u) {
        customerId = u.id;
        if (body.redeem_points && u.loyalty_points > 0) {
          const redeem = Math.min(u.loyalty_points, Math.floor(subtotal * 0.25));
          loyaltyDiscount = redeem * Number(settings.loyalty_point_value || 1);
          await db.prepare('UPDATE users SET loyalty_points = loyalty_points - ? WHERE id = ?').bind(redeem, u.id).run();
        }
      }
    }

    const totalDiscount = bulkSavings + couponDiscount;
    const totalAmount = Math.max(0, subtotal + deliveryCharge - totalDiscount - loyaltyDiscount);
    const orderNumber = `ES${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;
    const payMethod = String(body.payment_method || 'cod');
    const payStatus = payMethod === 'cod' ? 'unpaid' : (body.payment_trx_id ? 'pending_verify' : 'unpaid');

    const res = await db.prepare(`
      INSERT INTO orders (
        order_number, customer_id, customer_name, customer_phone, customer_address, delivery_zone,
        subtotal, delivery_charge, discount_amount, loyalty_discount, total_amount, total_cost,
        payment_method, payment_status, payment_sender, payment_trx_id, coupon_code,
        status, customer_note, ip_address, source, items_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(
      orderNumber, customerId, name, phone, address, zone,
      subtotal, deliveryCharge, totalDiscount, loyaltyDiscount, totalAmount, totalCost,
      payMethod, payStatus, String(body.payment_sender || ''), String(body.payment_trx_id || ''), couponCode,
      String(body.customer_note || ''), ip, String(body.source || 'website'), JSON.stringify(verifiedItems)
    ).run();

    // Decrement stock & increment sold_count
    for (const it of verifiedItems) {
      await db.prepare('UPDATE products SET stock = MAX(0, stock - ?), sold_count = sold_count + ? WHERE id = ?')
        .bind(it.qty, it.qty, it.product_id).run();
    }

    // Award loyalty points to registered customer
    if (customerId) {
      const earned = Math.floor(totalAmount / 100) * Number(settings.loyalty_earn_rate || 1);
      if (earned > 0) {
        await db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').bind(earned, customerId).run();
      }
    }

    // Mark matching incomplete order as converted
    if (body.session_id) {
      await db.prepare("UPDATE incomplete_orders SET status = 'converted' WHERE session_id = ? OR customer_phone = ?")
        .bind(String(body.session_id), phone).run();
    } else {
      await db.prepare("UPDATE incomplete_orders SET status = 'converted' WHERE customer_phone = ? AND status = 'open'").bind(phone).run();
    }

    const orderRecord = {
      id: res.meta.last_row_id,
      order_number: orderNumber,
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      subtotal, delivery_charge: deliveryCharge, discount_amount: totalDiscount,
      loyalty_discount: loyaltyDiscount, total_amount: totalAmount,
      payment_method: payMethod, status: 'pending', items: verifiedItems
    };

    // Background Server-Side Facebook CAPI & SMS Notification
    const bgTasks = Promise.all([
      sendFacebookCAPI(settings, 'Purchase', {
        event_id: body.event_id || orderNumber,
        phone, name, value: totalAmount,
        content_ids: verifiedItems.map(i => String(i.product_id)),
        num_items: verifiedItems.reduce((a, b) => a + b.qty, 0)
      }, request),
      sendOrderNotification(settings, orderRecord, `${settings.site_name}: আপনার অর্ডার #${orderNumber} (৳${totalAmount}) সফলভাবে গ্রহণ করা হয়েছে। ধন্যবাদ!`)
    ]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(bgTasks);

    return json({ ok: true, order: orderRecord }, 201);
  }

  // GET /api/orders/track?q=ORDER_OR_PHONE
  if (method === 'GET' && subpath === '/orders/track') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json({ ok: false, error: 'অর্ডার আইডি অথবা ফোন নম্বর দিন।' }, 400);
    const cleanPhone = q.replace(/[^0-9]/g, '');
    const { results } = await db.prepare(
      'SELECT order_number, customer_name, customer_phone, customer_address, delivery_zone, subtotal, delivery_charge, discount_amount, total_amount, payment_method, payment_status, status, courier_name, courier_consignment_id, courier_tracking_code, items_json, created_at FROM orders WHERE UPPER(order_number) = UPPER(?) OR customer_phone = ? ORDER BY id DESC LIMIT 10'
    ).bind(q, cleanPhone).all();

    return json({
      ok: true,
      orders: (results || []).map(o => ({ ...o, items: parseJsonSafe(o.items_json, []) }))
    });
  }

  // POST /api/capi/event (Server-Side CAPI Relay for ViewContent / AddToCart / InitiateCheckout)
  if (method === 'POST' && subpath === '/capi/event') {
    const body = await request.json();
    const settings = await getAllSettings(db);
    const allowed = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout'];
    if (!allowed.includes(body.event_name)) return json({ ok: false }, 400);
    const task = sendFacebookCAPI(settings, body.event_name, body, request);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    return json({ ok: true });
  }

  // GET /api/pages/:slug (Policy & CMS pages)
  if (method === 'GET' && subpath.startsWith('/pages/')) {
    const slug = subpath.replace('/pages/', '');
    const page = await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
    if (!page) return json({ ok: false, error: 'Page not found' }, 404);
    return json({ ok: true, page });
  }

  // Customer Auth: POST /api/auth/register
  if (method === 'POST' && subpath === '/auth/register') {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').replace(/[^0-9]/g, '');
    const password = String(body.password || '');
    if (!name || phone.length < 11 || password.length < 4) {
      return json({ ok: false, error: 'নাম, ১১ ডিজিটের ফোন নম্বর এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড দিন।' }, 400);
    }
    const exists = await db.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
    if (exists) return json({ ok: false, error: 'এই নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা আছে। লগইন করুন।' }, 409);

    const hash = await hashPassword(password);
    const r = await db.prepare(
      "INSERT INTO users (name, phone, password_hash, role, address, loyalty_points) VALUES (?, ?, ?, 'customer', ?, 50)"
    ).bind(name, phone, hash, String(body.address || '')).run();

    const user = { id: r.meta.last_row_id, name, phone, role: 'customer', loyalty_points: 50 };
    const token = await signJWT(user, getJwtSecret(env));
    return json({ ok: true, token, user }, 201);
  }

  // Unified Login (Customer & Admin/Staff): POST /api/auth/login
  if (method === 'POST' && subpath === '/auth/login') {
    const body = await request.json();
    const phone = String(body.phone || '').replace(/[^0-9]/g, '');
    const password = String(body.password || '');
    if (!phone || !password) return json({ ok: false, error: 'ফোন নম্বর এবং পাসওয়ার্ড দিন।' }, 400);

    const user = await db.prepare('SELECT * FROM users WHERE phone = ? AND is_active = 1').bind(phone).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ ok: false, error: 'ফোন নম্বর অথবা পাসওয়ার্ড সঠিক নয়।' }, 401);
    }

    const safeUser = {
      id: user.id, name: user.name, phone: user.phone, email: user.email,
      role: user.role, address: user.address, loyalty_points: user.loyalty_points
    };
    const token = await signJWT(safeUser, getJwtSecret(env));
    return json({ ok: true, token, user: safeUser });
  }

  // GET /api/account/me
  if (method === 'GET' && subpath === '/account/me') {
    const auth = await authenticateRequest(request, env);
    if (!auth) return json({ ok: false, error: 'Unauthorized' }, 401);
    const user = await db.prepare('SELECT id, name, phone, email, role, address, loyalty_points, created_at FROM users WHERE id = ?').bind(auth.id).first();
    if (!user) return json({ ok: false, error: 'User not found' }, 404);
    const orders = await db.prepare('SELECT * FROM orders WHERE customer_id = ? OR customer_phone = ? ORDER BY id DESC LIMIT 30').bind(user.id, user.phone).all();
    return json({
      ok: true,
      user,
      orders: (orders.results || []).map(o => ({ ...o, items: parseJsonSafe(o.items_json, []) }))
    });
  }

  // PUT /api/account/me
  if (method === 'PUT' && subpath === '/account/me') {
    const auth = await authenticateRequest(request, env);
    if (!auth) return json({ ok: false, error: 'Unauthorized' }, 401);
    const body = await request.json();
    await db.prepare('UPDATE users SET name = ?, address = ?, email = ? WHERE id = ?')
      .bind(String(body.name || auth.name), String(body.address || ''), String(body.email || ''), auth.id).run();
    return json({ ok: true, message: 'প্রোফাইল আপডেট হয়েছে।' });
  }

  return null;
}

// ==================== ADMIN & MOBILE APP ROUTES ====================
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || `item-${Date.now()}`;
}

async function handleAdminRoutes(method, subpath, request, env, ctx) {
  const db = env.DB;
  const url = new URL(request.url);

  // Special 1-Click DB Initialization Route: POST /api/admin/init-db
  // Allowed if DB is not initialized yet OR if authenticated as super_admin
  if (method === 'POST' && subpath === '/admin/init-db') {
    let alreadyHasAdmin = false;
    try {
      const a = await db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").first();
      alreadyHasAdmin = Boolean(a);
    } catch { alreadyHasAdmin = false; }

    if (alreadyHasAdmin) {
      const user = await authenticateRequest(request, env);
      const guard = requireRole(user, ['super_admin']);
      if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status);
    }
    const body = await request.json().catch(() => ({}));
    const result = await initializeDatabase(db, env, body.seed_demo !== false);
    return json({
      ok: true,
      message: 'ডাটাবেস ও ডেমো ডাটা সফলভাবে সেটআপ হয়েছে!',
      default_admin_phone: result.admin_phone,
      note: 'ডিফল্ট পাসওয়ার্ড আপনার Cloudflare Env (ADMIN_PASSWORD) অথবা admin1234'
    });
  }

  // All other /admin/* routes require authentication (JWT or Mobile App X-API-Key)
  const user = await authenticateRequest(request, env);
  const guard = requireRole(user, ['super_admin', 'moderator']);
  if (!guard.ok) return json({ ok: false, error: guard.error }, guard.status);
  const isSuper = user.role === 'super_admin';

  // GET /api/admin/dashboard (KPIs, Profit/Loss, Daily Chart, Low Stock Alerts)
  if (method === 'GET' && subpath === '/admin/dashboard') {
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || 30)));
    const [orderStats, todayStats, statusCounts, lowStock, incompleteCount, expenseSum, dailyChart, recentOrders] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) as total_orders,
          SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total_amount ELSE 0 END) as gross_sales,
          SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END) as delivered_sales,
          SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total_cost ELSE 0 END) as product_cost,
          SUM(CASE WHEN status = 'returned' THEN delivery_charge ELSE 0 END) as return_loss
        FROM orders WHERE created_at >= datetime('now', '-' || ? || ' days')
      `).bind(days).first(),
      db.prepare("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as sales FROM orders WHERE date(created_at) = date('now')").first(),
      db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all(),
      db.prepare('SELECT id, name, sku, stock, sale_price FROM products WHERE is_active = 1 AND stock <= 5 ORDER BY stock ASC LIMIT 15').all(),
      db.prepare("SELECT COUNT(*) as c FROM incomplete_orders WHERE status = 'open'").first(),
      db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date >= date('now', '-' || ? || ' days')").bind(days).first(),
      db.prepare(`
        SELECT date(created_at) as day, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as sales
        FROM orders WHERE created_at >= datetime('now', '-14 days') AND status NOT IN ('cancelled','returned')
        GROUP BY date(created_at) ORDER BY day ASC
      `).all(),
      db.prepare('SELECT id, order_number, customer_name, customer_phone, total_amount, status, created_at FROM orders ORDER BY id DESC LIMIT 8').all()
    ]);

    const statusMap = {};
    for (const r of statusCounts.results || []) statusMap[r.status] = r.count;

    const grossSales = Number(orderStats?.gross_sales || 0);
    const productCost = Number(orderStats?.product_cost || 0);
    const returnLoss = Number(orderStats?.return_loss || 0);
    const otherExpenses = Number(expenseSum?.total || 0);
    const netProfit = grossSales - productCost - returnLoss - otherExpenses;

    return json({
      ok: true,
      role: user.role,
      today: todayStats,
      status_counts: statusMap,
      incomplete_open: incompleteCount?.c || 0,
      low_stock: lowStock.results || [],
      daily_chart: dailyChart.results || [],
      recent_orders: recentOrders.results || [],
      // Profit & Loss only exposed to super_admin
      financials: isSuper ? {
        days,
        total_orders: orderStats?.total_orders || 0,
        gross_sales: grossSales,
        delivered_sales: Number(orderStats?.delivered_sales || 0),
        product_cost: productCost,
        return_loss: returnLoss,
        other_expenses: otherExpenses,
        net_profit: netProfit
      } : null
    });
  }

  // ==================== ORDERS ====================
  if (method === 'GET' && subpath === '/admin/orders') {
    const status = url.searchParams.get('status') || '';
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(100, Number(url.searchParams.get('limit') || 50));
    let where = ['1=1'], binds = [];
    if (status) { where.push('status = ?'); binds.push(status); }
    if (q) { where.push('(order_number LIKE ? OR customer_phone LIKE ? OR customer_name LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const { results } = await db.prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).bind(...binds, limit).all();
    return json({ ok: true, orders: (results || []).map(o => ({ ...o, items: parseJsonSafe(o.items_json, []) })) });
  }

  if (method === 'PUT' && subpath.match(/^\/admin\/orders\/\d+$/)) {
    const id = Number(subpath.split('/').pop());
    const body = await request.json();
    const existing = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    if (!existing) return json({ ok: false, error: 'Order not found' }, 404);

    const newStatus = body.status || existing.status;
    await db.prepare(`
      UPDATE orders SET
        status = ?, payment_status = ?, admin_note = ?,
        courier_name = ?, courier_consignment_id = ?, courier_tracking_code = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      newStatus,
      body.payment_status || existing.payment_status,
      body.admin_note !== undefined ? body.admin_note : existing.admin_note,
      body.courier_name !== undefined ? body.courier_name : existing.courier_name,
      body.courier_consignment_id !== undefined ? body.courier_consignment_id : existing.courier_consignment_id,
      body.courier_tracking_code !== undefined ? body.courier_tracking_code : existing.courier_tracking_code,
      id
    ).run();

    // Auto SMS/Webhook on Confirmed or Shipped
    if (newStatus !== existing.status && (newStatus === 'confirmed' || newStatus === 'shipped')) {
      const settings = await getAllSettings(db);
      const msg = newStatus === 'confirmed'
        ? `${settings.site_name}: আপনার অর্ডার #${existing.order_number} কনফার্ম করা হয়েছে। শীঘ্রই ডেলিভারি করা হবে।`
        : `${settings.site_name}: আপনার অর্ডার #${existing.order_number} কুরিয়ারে পাঠানো হয়েছে। ট্র্যাকিং: ${body.courier_tracking_code || existing.courier_tracking_code || existing.order_number}`;
      const t = sendOrderNotification(settings, existing, msg);
      if (ctx && ctx.waitUntil) ctx.waitUntil(t);
    }

    return json({ ok: true, message: 'অর্ডার আপডেট হয়েছে।' });
  }

  // 1-Click Courier Booking: POST /api/admin/orders/:id/courier
  if (method === 'POST' && subpath.match(/^\/admin\/orders\/\d+\/courier$/)) {
    const id = Number(subpath.split('/')[3]);
    const body = await request.json();
    const provider = String(body.provider || 'steadfast').toLowerCase();
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    if (!order) return json({ ok: false, error: 'Order not found' }, 404);

    const settings = await getAllSettings(db);
    let result;
    if (provider === 'steadfast') result = await bookSteadfast(settings, order);
    else if (provider === 'pathao') result = await bookPathao(settings, order);
    else if (provider === 'redx') result = await bookRedX(settings, order);
    else return json({ ok: false, error: 'Unsupported courier provider' }, 400);

    if (!result.ok) return json(result, 400);

    await db.prepare(`
      UPDATE orders SET status = 'shipped', courier_name = ?, courier_consignment_id = ?, courier_tracking_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(result.courier_name, result.consignment_id, result.tracking_code, id).run();

    return json({ ok: true, booking: result });
  }

  // Fraud Check: GET /api/admin/fraud-check?phone=017...
  if (method === 'GET' && subpath === '/admin/fraud-check') {
    const phone = url.searchParams.get('phone') || '';
    const settings = await getAllSettings(db);
    const report = await checkCustomerFraud(db, settings, phone);
    return json({ ok: true, report });
  }

  // ==================== INCOMPLETE ORDERS ====================
  if (method === 'GET' && subpath === '/admin/incomplete-orders') {
    const { results } = await db.prepare("SELECT * FROM incomplete_orders WHERE status = 'open' ORDER BY updated_at DESC LIMIT 100").all();
    return json({ ok: true, leads: (results || []).map(l => ({ ...l, items: parseJsonSafe(l.items_json, []) })) });
  }

  if (method === 'DELETE' && subpath.match(/^\/admin\/incomplete-orders\/\d+$/)) {
    const id = Number(subpath.split('/').pop());
    await db.prepare('DELETE FROM incomplete_orders WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // ==================== PRODUCTS CRUD ====================
  if (method === 'GET' && subpath === '/admin/products') {
    const { results } = await db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id DESC').all();
    return json({
      ok: true,
      products: (results || []).map(p => ({
        ...p,
        images: parseJsonSafe(p.images, []),
        specs: parseJsonSafe(p.specs, []),
        variants: parseJsonSafe(p.variants, {}),
        bulk_discount: parseJsonSafe(p.bulk_discount, {}),
        landing_content: parseJsonSafe(p.landing_content, {})
      }))
    });
  }

  if (method === 'POST' && subpath === '/admin/products') {
    const b = await request.json();
    const name = String(b.name || '').trim();
    if (!name) return json({ ok: false, error: 'Product name required' }, 400);
    const slug = (b.slug ? slugify(b.slug) : slugify(name)) + '-' + Math.floor(100 + Math.random() * 899);

    const r = await db.prepare(`
      INSERT INTO products (
        name, name_bn, slug, sku, category_id, brand, buying_price, regular_price, sale_price,
        stock, images, video_url, short_desc, description, specs, variants, bulk_discount,
        landing_content, is_featured, is_flash_sale, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name, String(b.name_bn || ''), slug, String(b.sku || ''), Number(b.category_id || 1),
      String(b.brand || ''), Number(b.buying_price || 0), Number(b.regular_price || b.sale_price || 0),
      Number(b.sale_price || 0), Number(b.stock || 0), JSON.stringify(b.images || []),
      String(b.video_url || ''), String(b.short_desc || ''), String(b.description || ''),
      JSON.stringify(b.specs || []), JSON.stringify(b.variants || { colors: [], sizes: [] }),
      JSON.stringify(b.bulk_discount || {}), JSON.stringify(b.landing_content || {}),
      b.is_featured ? 1 : 0, b.is_flash_sale ? 1 : 0, b.is_active === false ? 0 : 1
    ).run();

    return json({ ok: true, id: r.meta.last_row_id, slug }, 201);
  }

  if (method === 'PUT' && subpath.match(/^\/admin\/products\/\d+$/)) {
    const id = Number(subpath.split('/').pop());
    const b = await request.json();
    await db.prepare(`
      UPDATE products SET
        name = ?, name_bn = ?, sku = ?, category_id = ?, brand = ?,
        buying_price = ?, regular_price = ?, sale_price = ?, stock = ?,
        images = ?, video_url = ?, short_desc = ?, description = ?,
        specs = ?, variants = ?, bulk_discount = ?, landing_content = ?,
        is_featured = ?, is_flash_sale = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      String(b.name || ''), String(b.name_bn || ''), String(b.sku || ''), Number(b.category_id || 1),
      String(b.brand || ''), Number(b.buying_price || 0), Number(b.regular_price || 0),
      Number(b.sale_price || 0), Number(b.stock || 0), JSON.stringify(b.images || []),
      String(b.video_url || ''), String(b.short_desc || ''), String(b.description || ''),
      JSON.stringify(b.specs || []), JSON.stringify(b.variants || {}),
      JSON.stringify(b.bulk_discount || {}), JSON.stringify(b.landing_content || {}),
      b.is_featured ? 1 : 0, b.is_flash_sale ? 1 : 0, b.is_active === false ? 0 : 1, id
    ).run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && subpath.match(/^\/admin\/products\/\d+$/)) {
    const id = Number(subpath.split('/').pop());
    await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // ==================== CATEGORIES, BANNERS, COUPONS ====================
  if (method === 'GET' && subpath === '/admin/categories') {
    const { results } = await db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
    return json({ ok: true, categories: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/categories') {
    const b = await request.json();
    const slug = slugify(b.slug || b.name);
    await db.prepare('INSERT INTO categories (name, name_bn, slug, image, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(b.name, b.name_bn || '', slug, b.image || '', b.icon || '📦', Number(b.sort_order || 0)).run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/categories\/\d+$/)) {
    await db.prepare('DELETE FROM categories WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  if (method === 'GET' && subpath === '/admin/banners') {
    const { results } = await db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id DESC').all();
    return json({ ok: true, banners: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/banners') {
    const b = await request.json();
    await db.prepare('INSERT INTO banners (title, subtitle, image, link, position, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(b.title || '', b.subtitle || '', b.image || '', b.link || '/', b.position || 'hero', Number(b.sort_order || 0)).run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/banners\/\d+$/)) {
    await db.prepare('DELETE FROM banners WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  if (method === 'GET' && subpath === '/admin/coupons') {
    const { results } = await db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
    return json({ ok: true, coupons: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/coupons') {
    const b = await request.json();
    await db.prepare('INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(String(b.code).toUpperCase(), b.type || 'fixed', Number(b.value || 0), Number(b.min_order || 0), Number(b.max_discount || 0), Number(b.usage_limit || 1000), b.expires_at || '').run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/coupons\/\d+$/)) {
    await db.prepare('DELETE FROM coupons WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  // ==================== REVIEWS, EXPENSES, BLOCKLIST, CUSTOMERS ====================
  if (method === 'GET' && subpath === '/admin/reviews') {
    const { results } = await db.prepare('SELECT r.*, p.name as product_name FROM reviews r LEFT JOIN products p ON p.id = r.product_id ORDER BY r.id DESC LIMIT 100').all();
    return json({ ok: true, reviews: results || [] });
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/reviews\/\d+$/)) {
    await db.prepare('DELETE FROM reviews WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  if (method === 'GET' && subpath === '/admin/expenses') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const { results } = await db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT 100').all();
    return json({ ok: true, expenses: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/expenses') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const b = await request.json();
    await db.prepare('INSERT INTO expenses (title, category, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)')
      .bind(b.title, b.category || 'marketing', Number(b.amount || 0), b.expense_date || new Date().toISOString().slice(0, 10), b.note || '').run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/expenses\/\d+$/)) {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    await db.prepare('DELETE FROM expenses WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  if (method === 'GET' && subpath === '/admin/blocked') {
    const { results } = await db.prepare('SELECT * FROM blocked_entities ORDER BY id DESC').all();
    return json({ ok: true, blocked: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/blocked') {
    const b = await request.json();
    await db.prepare('INSERT OR IGNORE INTO blocked_entities (type, value, reason) VALUES (?, ?, ?)')
      .bind(b.type || 'phone', String(b.value || '').trim(), b.reason || 'Fake Order').run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/blocked\/\d+$/)) {
    await db.prepare('DELETE FROM blocked_entities WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  if (method === 'GET' && subpath === '/admin/customers') {
    const { results } = await db.prepare("SELECT id, name, phone, email, address, loyalty_points, created_at FROM users WHERE role = 'customer' ORDER BY id DESC LIMIT 100").all();
    return json({ ok: true, customers: results || [] });
  }

  // ==================== STAFF / MULTI-ADMIN MANAGEMENT ====================
  if (method === 'GET' && subpath === '/admin/staff') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const { results } = await db.prepare("SELECT id, name, phone, email, role, is_active, created_at FROM users WHERE role IN ('super_admin','moderator') ORDER BY id ASC").all();
    return json({ ok: true, staff: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/staff') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const b = await request.json();
    const hash = await hashPassword(String(b.password || '123456'));
    await db.prepare('INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .bind(b.name, String(b.phone).replace(/[^0-9]/g, ''), b.email || '', hash, b.role === 'super_admin' ? 'super_admin' : 'moderator').run();
    return json({ ok: true }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/staff\/\d+$/)) {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const id = Number(subpath.split('/').pop());
    if (id === user.id) return json({ ok: false, error: 'নিজের অ্যাকাউন্ট ডিলিট করা যাবে না।' }, 400);
    await db.prepare("DELETE FROM users WHERE id = ? AND role != 'customer'").bind(id).run();
    return json({ ok: true });
  }

  // ==================== MOBILE APP API KEYS ====================
  if (method === 'GET' && subpath === '/admin/api-keys') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const { results } = await db.prepare('SELECT id, label, key_prefix, role, is_active, last_used_at, created_at FROM api_keys ORDER BY id DESC').all();
    return json({ ok: true, api_keys: results || [] });
  }
  if (method === 'POST' && subpath === '/admin/api-keys') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const b = await request.json();
    const rawKey = generateApiKeyString();
    const keyHash = await sha256Hex(rawKey);
    const prefix = rawKey.slice(0, 16) + '...';
    const role = b.role === 'moderator' ? 'moderator' : 'super_admin';
    await db.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, role) VALUES (?, ?, ?, ?)')
      .bind(String(b.label || 'Android Admin App'), keyHash, prefix, role).run();
    return json({ ok: true, raw_key: rawKey, message: 'এই API Key টি এখনই কপি করে রাখুন—পরে আর পুরোটা দেখা যাবে না।' }, 201);
  }
  if (method === 'DELETE' && subpath.match(/^\/admin\/api-keys\/\d+$/)) {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    await db.prepare('DELETE FROM api_keys WHERE id = ?').bind(Number(subpath.split('/').pop())).run();
    return json({ ok: true });
  }

  // ==================== SETTINGS & API INTEGRATIONS ====================
  if (method === 'GET' && subpath === '/admin/settings') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const [settings, pages] = await Promise.all([
      getAllSettings(db),
      db.prepare('SELECT * FROM pages').all()
    ]);
    return json({ ok: true, settings, pages: pages.results || [] });
  }

  if (method === 'PUT' && subpath === '/admin/settings') {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const body = await request.json();
    const updates = body.settings || body;
    for (const [k, v] of Object.entries(updates)) {
      if (typeof v === 'object') continue;
      await db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
      ).bind(k, String(v ?? '')).run();
    }
    return json({ ok: true, message: 'সকল সেটিংস এবং API কনফিগারেশন সেভ হয়েছে!' });
  }

  if (method === 'PUT' && subpath.startsWith('/admin/pages/')) {
    if (!isSuper) return json({ ok: false, error: 'Super Admin only' }, 403);
    const slug = subpath.replace('/admin/pages/', '');
    const b = await request.json();
    await db.prepare(
      'INSERT INTO pages (slug, title, title_bn, content, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, title_bn = excluded.title_bn, content = excluded.content, updated_at = CURRENT_TIMESTAMP'
    ).bind(slug, b.title || slug, b.title_bn || '', b.content || '').run();
    return json({ ok: true });
  }

  // ==================== IMAGE UPLOAD PROXY (ImgBB / Cloudinary - Cardless Free) ====================
  if (method === 'POST' && subpath === '/admin/upload-image') {
    const settings = await getAllSettings(db);
    const b = await request.json(); // { image_base64: "data:image/webp;base64,..." }
    const rawData = String(b.image_base64 || '');
    if (!rawData) return json({ ok: false, error: 'No image data provided' }, 400);

    // 1. Cloudinary Free Unsigned Upload
    if (settings.image_provider === 'cloudinary' && settings.cloudinary_cloud_name && settings.cloudinary_upload_preset) {
      const form = new FormData();
      form.append('file', rawData);
      form.append('upload_preset', settings.cloudinary_upload_preset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${settings.cloudinary_cloud_name}/image/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (data.secure_url) return json({ ok: true, url: data.secure_url, provider: 'cloudinary' });
      return json({ ok: false, error: data.error?.message || 'Cloudinary upload failed' }, 400);
    }

    // 2. ImgBB Free API Upload
    if (settings.imgbb_api_key) {
      const pureBase64 = rawData.includes(',') ? rawData.split(',')[1] : rawData;
      const form = new FormData();
      form.append('image', pureBase64);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(settings.imgbb_api_key)}`, { method: 'POST', body: form });
      const data = await res.json();
      if (data.success && data.data?.url) return json({ ok: true, url: data.data.url, provider: 'imgbb' });
      return json({ ok: false, error: data.error?.message || 'ImgBB upload failed' }, 400);
    }

    // 3. Fallback: If compressed WebP is small (< 120KB), return inline data URI directly so admin works even before setting ImgBB/Cloudinary!
    if (rawData.length < 160000) {
      return json({ ok: true, url: rawData, provider: 'inline_webp', note: 'Set ImgBB or Cloudinary key in API Hub for external CDN hosting.' });
    }
    return json({ ok: false, error: 'ইমেজ হোস্টিং API (ImgBB অথবা Cloudinary) সেটিংস থেকে সেট করুন, অথবা ডাইরেক্ট Image URL দিন।' }, 400);
  }

  return json({ ok: false, error: 'Admin endpoint not found' }, 404);
}

// ==================== EDGE ROUTER & STATIC ASSET HANDLER ====================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleOgProduct(slug, env, origin) {
  const targetUrl = `${origin}/product.html?slug=${encodeURIComponent(slug)}`;
  let title = 'E-ShopBD Product';
  let desc = 'বাংলাদেশের বিশ্বস্ত অনলাইন শপিং প্ল্যাটফর্ম';
  let image = '';
  let price = '';
  try {
    if (env.DB) {
      const p = await env.DB.prepare('SELECT name, name_bn, short_desc, sale_price, images FROM products WHERE slug = ? LIMIT 1').bind(slug).first();
      if (p) {
        title = `${p.name_bn || p.name} — ৳${p.sale_price}`;
        desc = p.short_desc || p.name;
        price = String(p.sale_price);
        const imgs = JSON.parse(p.images || '[]');
        if (imgs[0]) image = imgs[0];
      }
    }
  } catch {}
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
  <meta property="og:url" content="${esc(origin + '/p/' + slug)}">
  ${price ? `<meta property="product:price:amount" content="${esc(price)}"><meta property="product:price:currency" content="BDT">` : ''}
  <meta http-equiv="refresh" content="0;url=${esc(targetUrl)}">
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>Redirecting to product...</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleSitemap(env, origin) {
  const urls = [
    `${origin}/`,
    `${origin}/track.html`,
    `${origin}/page.html?slug=about-us`,
    `${origin}/page.html?slug=return-policy`,
    `${origin}/page.html?slug=privacy-policy`
  ];
  try {
    if (env.DB) {
      const prods = await env.DB.prepare('SELECT slug FROM products WHERE is_active = 1').all();
      for (const p of prods.results || []) {
        urls.push(`${origin}/product.html?slug=${encodeURIComponent(p.slug)}`);
      }
    }
  } catch {}
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

const BLOCKED_STATIC = new Set(['/_worker.js', '/wrangler.toml', '/schema.sql', '/README.md', '/APP_API_DOCS.md', '/.assetsignore', '/admin', '/admin/', '/admin.html']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Block direct download of backend / config / doc files stored in root
    if (BLOCKED_STATIC.has(pathname) || pathname.endsWith('.sql') || pathname.endsWith('.toml')) {
      return new Response('Not Found', { status: 404 });
    }

    // 2. API Routes (/api/* and /api/v1/*)
    if (pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (!env.DB) {
        return withCors(new Response(JSON.stringify({
          ok: false,
          error: 'Cloudflare D1 database binding "DB" not found! Go to Cloudflare Pages > Settings > Bindings > Add D1 database binding with variable name DB.'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
      }

      const rest = pathname.slice(5); // after '/api/'
      const segments = rest.split('/').filter(Boolean);
      const cleanSegments = segments[0] === 'v1' ? segments.slice(1) : segments;
      const subpath = '/' + cleanSegments.join('/');

      try {
        if (subpath.startsWith('/admin')) {
          const res = await handleAdminRoutes(request.method, subpath, request, env, ctx);
          return withCors(res);
        }
        const pubRes = await handlePublicRoutes(request.method, subpath, request, env, ctx);
        if (pubRes) return withCors(pubRes);
        return withCors(new Response(JSON.stringify({ ok: false, error: `Route not found: ${request.method} /api${subpath}` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      } catch (err) {
        return withCors(new Response(JSON.stringify({ ok: false, error: err.message || 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // 3. Dynamic Open Graph Product Share Preview (/p/:slug)
    if (pathname.startsWith('/p/') && pathname.length > 3) {
      const slug = decodeURIComponent(pathname.slice(3).replace(/\/+$/, ''));
      return handleOgProduct(slug, env, url.origin);
    }

    // 4. Dynamic SEO Sitemap
    if (pathname === '/sitemap.xml') {
      return handleSitemap(env, url.origin);
    }

    // 5. Secret Admin Panel URL (/cp-eshop-983/ -> /cp-eshop-983)
    if (pathname === '/cp-eshop-983/') {
      return Response.redirect(new URL('/cp-eshop-983', url.origin).toString(), 302);
    }

    // 6. Serve all static frontend files from root
    return env.ASSETS.fetch(request);
  }
};

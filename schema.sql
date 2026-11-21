-- E-ShopBD Cloudflare D1 Complete Database Schema
-- Run in Cloudflare D1 Console OR click 'Initialize Database' inside /admin/

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- super_admin, moderator, customer
  address TEXT DEFAULT '',
  loyalty_points INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',
  is_active INTEGER DEFAULT 1,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_bn TEXT DEFAULT '',
  slug TEXT UNIQUE NOT NULL,
  image TEXT DEFAULT '',
  icon TEXT DEFAULT '📦',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  image TEXT NOT NULL,
  link TEXT DEFAULT '/',
  position TEXT DEFAULT 'hero', -- hero, promo_top, promo_mid
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_bn TEXT DEFAULT '',
  slug TEXT UNIQUE NOT NULL,
  sku TEXT DEFAULT '',
  category_id INTEGER,
  brand TEXT DEFAULT '',
  buying_price REAL DEFAULT 0,
  regular_price REAL NOT NULL,
  sale_price REAL NOT NULL,
  stock INTEGER DEFAULT 0,
  images TEXT DEFAULT '[]', -- JSON array of image URLs
  video_url TEXT DEFAULT '',
  short_desc TEXT DEFAULT '',
  description TEXT DEFAULT '',
  specs TEXT DEFAULT '[]', -- JSON array [{key, value}]
  variants TEXT DEFAULT '{}', -- JSON {sizes:[], colors:[]}
  bulk_discount TEXT DEFAULT '{}', -- JSON {min_qty:2, discount_amount:100}
  landing_content TEXT DEFAULT '{}', -- JSON {headline, bullets:[], offer_note}
  is_featured INTEGER DEFAULT 0,
  is_flash_sale INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sold_count INTEGER DEFAULT 0,
  rating_avg REAL DEFAULT 5.0,
  review_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  delivery_zone TEXT DEFAULT 'inside_dhaka',
  subtotal REAL NOT NULL,
  delivery_charge REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  loyalty_discount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  total_cost REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cod', -- cod, bkash, nagad, rocket, online
  payment_status TEXT DEFAULT 'unpaid', -- unpaid, pending_verify, paid
  payment_sender TEXT DEFAULT '',
  payment_trx_id TEXT DEFAULT '',
  coupon_code TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', -- pending, confirmed, processing, shipped, delivered, cancelled, returned
  courier_name TEXT DEFAULT '',
  courier_consignment_id TEXT DEFAULT '',
  courier_tracking_code TEXT DEFAULT '',
  customer_note TEXT DEFAULT '',
  admin_note TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  source TEXT DEFAULT 'website', -- website, landing, app, manual
  items_json TEXT NOT NULL, -- JSON array of ordered items
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incomplete_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT NOT NULL,
  customer_address TEXT DEFAULT '',
  delivery_zone TEXT DEFAULT 'inside_dhaka',
  items_json TEXT DEFAULT '[]',
  subtotal REAL DEFAULT 0,
  ip_address TEXT DEFAULT '',
  status TEXT DEFAULT 'open', -- open, converted, dismissed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'fixed', -- fixed, percent
  value REAL NOT NULL,
  min_order REAL DEFAULT 0,
  max_discount REAL DEFAULT 0,
  usage_limit INTEGER DEFAULT 1000,
  used_count INTEGER DEFAULT 0,
  expires_at TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT DEFAULT '',
  image TEXT DEFAULT '',
  is_approved INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'marketing', -- marketing, delivery_loss, office, salary, other
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocked_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- phone, ip
  value TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, value)
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_bn TEXT DEFAULT '',
  content TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_incomplete_phone ON incomplete_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

# E-ShopBD REST API Documentation (Website & Mobile Admin App)

Base URL: `https://<your-site>.pages.dev/api/v1` (also aliased at `/api`)

## Authentication (2 Modes Supported)

1. **Mobile Admin App API Key (Recommended for your personal Admin App):**
   - Generate from Web Admin Panel → **🔌 API ও মোবাইল অ্যাপ হাব** → `+ নতুন App API Key তৈরি করুন`
   - Send header on every request:
     ```
     X-API-Key: esbd_live_xxxxxxxxxxxxxxxxxxxxx
     ```
2. **JWT Bearer Token (Multi-Staff / Customer Login):**
   - `POST /api/v1/auth/login` with `{ "phone": "01700000000", "password": "yourpassword" }`
   - Send header:
     ```
     Authorization: Bearer <token>
     ```

---

## Admin & Mobile App Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Check API & D1 Database health |
| `POST` | `/api/v1/admin/init-db` | 1-Click initialize D1 tables & seed demo products |
| `GET` | `/api/v1/admin/dashboard?days=30` | Today stats, Status counts, Low stock alerts, 14-day chart & Net Profit/Loss (Super Admin) |
| `GET` | `/api/v1/admin/orders?status=&q=` | List orders with filter & search |
| `PUT` | `/api/v1/admin/orders/:id` | Update status, payment_status, admin_note, courier details (triggers auto SMS/Webhook) |
| `POST` | `/api/v1/admin/orders/:id/courier` | 1-Click Courier Booking (`{ "provider": "steadfast" | "pathao" | "redx" }`) |
| `GET` | `/api/v1/admin/fraud-check?phone=017...` | Internal delivery/return history + External Fraud Check proxy |
| `GET` | `/api/v1/admin/incomplete-orders` | List abandoned checkout leads |
| `DELETE` | `/api/v1/admin/incomplete-orders/:id` | Dismiss/delete lead |
| `GET` | `/api/v1/admin/products` | List all products (including buying_price & stock) |
| `POST` | `/api/v1/admin/products` | Add new product |
| `PUT` | `/api/v1/admin/products/:id` | Update product / stock / price |
| `DELETE` | `/api/v1/admin/products/:id` | Delete product |
| `POST` | `/api/v1/admin/upload-image` | Upload base64 WebP image via ImgBB / Cloudinary (`{ "image_base64": "data:image/webp;base64,..." }`) |
| `GET/POST/DELETE` | `/api/v1/admin/categories` | Manage categories |
| `GET/POST/DELETE` | `/api/v1/admin/banners` | Manage home sliders & promo banners |
| `GET/POST/DELETE` | `/api/v1/admin/coupons` | Manage discount coupons |
| `GET/POST/DELETE` | `/api/v1/admin/expenses` | Log marketing/delivery/office expenses for Net Profit |
| `GET/POST/DELETE` | `/api/v1/admin/blocked` | Block/Unblock fake order phone numbers & IPs |
| `GET/POST/DELETE` | `/api/v1/admin/staff` | Manage Super Admin & Moderator accounts |
| `GET/POST/DELETE` | `/api/v1/admin/api-keys` | Create / Revoke Mobile App API Keys |
| `GET/PUT` | `/api/v1/admin/settings` | Read/Update site branding, delivery charges & all 3rd-party API keys |

## Public Storefront Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/store/bootstrap` | Single-call homepage loader (settings, categories, banners, flash, featured, latest) |
| `GET` | `/api/v1/products?q=&category=&brand=&min_price=&max_price=&in_stock=1&sort=` | Filtered & sorted product catalog |
| `GET` | `/api/v1/products/:slug` | Single product detail, reviews & related products |
| `POST` | `/api/v1/incomplete-orders` | Auto-save checkout lead when phone is typed |
| `POST` | `/api/v1/orders` | Place order (with fraud shield, rate-limit, bulk discount, coupon, loyalty & FB CAPI) |
| `GET` | `/api/v1/orders/track?q=` | Track orders by Order Number or Phone |
| `POST` | `/api/v1/coupons/validate` | Validate coupon code |
| `POST` | `/api/v1/reviews` | Submit product review |
| `POST` | `/api/v1/auth/register` | Customer registration (+50 bonus loyalty points) |
| `GET/PUT` | `/api/v1/account/me` | Customer profile, loyalty points & order history |

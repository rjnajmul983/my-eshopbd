# E-ShopBD — Mobile-Friendly Root-Only Cloudflare Pages + D1 Package

এই ভার্সনে **কোনো সাব-ফোল্ডার নেই**—ফোন থেকেই GitHub-এর Root ফোল্ডারে একসাথে সব ফাইল সিলেক্ট করে আপলোড করা যাবে!

## সেটআপ গাইড (ফোন থেকে A to Z)

1. **GitHub-এ আপলোড:**
   - ZIP আনজিপ করলে মোট **২৩টি ফাইল** পাবেন (কোনো ফোল্ডার নেই)।
   - GitHub-এ নতুন Repository বানিয়ে **Add file → Upload files** এ গিয়ে ২৩টি ফাইল একসাথে সিলেক্ট করে Commit করুন।
2. **Cloudflare D1 ডাটাবেস তৈরি:**
   - Cloudflare Dashboard → **Storage & Databases → D1 SQL Database** → Create (`eshopbd-db`)।
3. **Cloudflare Pages কানেক্ট:**
   - **Workers & Pages → Create → Pages → Import an existing Git repository** → আপনার Repo সিলেক্ট করুন।
   - **Framework preset:** `None`
   - **Build command:** *(খালি রাখুন)*
   - **Build output directory:** *(খালি রাখুন অথবা `/` দিন — আগে `public` ছিল, এখন খালি রাখতে হবে!)*
   - **Save and Deploy** দিন।
4. **D1 Binding ও Variables:**
   - Pages Project → Settings → Bindings (Functions) → **D1 database bindings** → Variable name: `DB`, Database: `eshopbd-db` → Save।
   - Settings → Variables and Secrets → `JWT_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD` যোগ করুন।
   - Deployments ট্যাব থেকে সর্বশেষ ডিপ্লয়মেন্টে **Retry deployment** দিন।
5. **১-ক্লিক সেটআপ:**
   - `https://your-site.pages.dev/admin/` (অথবা `/admin.html`) ভিজিট করে **Initialize Database Now** বাটনে ক্লিক করুন!

# Airtel Packages Platform — Updated build

## Requirements
- Node.js 20 or newer
- No npm dependencies required

## Run locally
```bash
cd airtel-platform-updated
cp .env.example .env
npm run dev
```
Open:
- Website: http://localhost:3000/
- Admin: http://localhost:3000/admin/

Default local admin credentials (change before any deployment):
- Username: `admin`
- Password: `ChangeThisToA_StrongPassword!`

The server currently reads environment variables directly. To set them in a terminal for a local run:
```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='Use-A-Strong-Unique-Password' SESSION_SECRET='replace-with-a-long-random-secret' npm run dev
```

## Included
- Responsive Airtel-inspired customer storefront
- Server-backed package catalogue
- Checkout form with country calling codes and number-length checks
- Homepage currency selector with flags, currency codes and names (defaults to USD)
- Checkout defaults to USD and carries the selected homepage currency
- KES package prices are converted using a public exchange-rate feed when available
- Server-side admin login with HttpOnly, SameSite session cookie
- Admin package create/edit/delete
- Server-persisted customer requests and admin order view
- JSON data files in `data/`

## Important production notes
This is a runnable starter platform, not an authorized Airtel payment gateway integration. The checkout records a customer request but does **not** charge the customer. Real Airtel Money payments require an approved provider account, credentials, callback/webhook verification, transaction reconciliation, HTTPS, persistent production database, rate limiting, CSRF/origin protection and secure secret management.

The site never asks for, receives, or stores a mobile-money PIN or OTP. The customer must enter their PIN only in the official provider prompt or hosted provider payment page after that integration is implemented.

Before public deployment:
1. Set a strong unique `ADMIN_PASSWORD` and random `SESSION_SECRET`.
2. Use HTTPS and a persistent database.
3. Add login rate limiting and CSRF/origin protections.
4. Integrate the official payment provider API and verify signed callbacks server-side.
5. Review brand/trademark usage and obtain any permissions required for Airtel branding.

# VOXA CRM — Meta Lead Ads Backend

Node.js/Express backend deployed on Vercel. Handles Meta Lead Ads form management, webhook lead capture, and lead retrieval for the VOXA CRM frontend.

**Production URL:** `https://voxa-crm-backend.vercel.app`

---

## What It Does

- Creates and manages Lead Ads forms on a Facebook Page via the Meta Graph API
- Receives leads automatically via Meta webhook when a prospect submits a form
- Stores leads in PostgreSQL (Neon) and serves them to the frontend
- Archives forms on Meta and cleans up local database records

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL on Neon (connection pooler) |
| Deployment | Vercel (serverless) |
| Meta API | Graph API v25.0 |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/api/forms` | List all Lead Ads forms (active + archived) |
| `POST` | `/api/forms/create` | Create and publish a new Lead Ads form to Meta |
| `DELETE` | `/api/forms/:id` | Archive a form on Meta and remove from DB |
| `GET` | `/api/leads` | Fetch the 100 most recent captured leads |
| `GET` | `/webhook` | Meta webhook verification (Meta use only) |
| `POST` | `/webhook` | Receive lead events from Meta (Meta use only) |

---

## Project Structure

```
voxa-crm-backend/
├── app.js                        # Express entry point, CORS, route registration
├── vercel.json                   # Vercel deployment config
├── src/
│   ├── config/
│   │   └── db.js                 # PostgreSQL pool (Neon)
│   ├── controllers/
│   │   ├── formController.js     # getForms, createForm, archiveForm
│   │   ├── leadsController.js    # getLeads
│   │   └── webhookController.js  # verifyWebhook, receiveWebhook
│   └── routes/
│       ├── forms.js
│       ├── leads.js
│       └── webhook.js
└── package.json
```

---

## Environment Variables

Set these in Vercel → Project Settings → Environment Variables:

| Variable | Description |
|---|---|
| `META_APP_ID` | Meta App ID |
| `META_APP_SECRET` | Meta App Secret |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token (60-day, renew before expiry) |
| `META_PAGE_ID` | Facebook Page ID |
| `META_AD_ACCOUNT_ID` | Meta Ad Account ID |
| `META_WEBHOOK_VERIFY_TOKEN` | Secret token for webhook verification |
| `DATABASE_URL` | Neon PostgreSQL connection string (pooler URL, `?sslmode=require` only) |
| `FRONTEND_URL` | Frontend origin for CORS (e.g. `https://voxa-crm.vercel.app`) |

> **Important:** Use the Neon **pooler** URL, not the direct connection URL. Do not append `channel_binding=require` — Neon's PgBouncer in transaction mode does not support it.

---

## Database Schema

**`leads`** — one row per captured lead

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL | Primary key |
| `full_name` | VARCHAR(255) | |
| `email` | VARCHAR(255) | |
| `phone` | VARCHAR(50) | |
| `form_id` | VARCHAR(100) | Meta form ID |
| `form_name` | VARCHAR(255) | Null if form not created via this system |
| `lead_status` | VARCHAR(50) | Default `'new'` |
| `assigned_agent` | VARCHAR(100) | |
| `raw_data` | TEXT | Full JSON from Meta |
| `created_at` | TIMESTAMP | Auto-set on insert |

**`meta_forms`** — one row per form created through this backend

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL | Primary key |
| `form_name` | VARCHAR(255) | |
| `meta_form_id` | VARCHAR(100) | Meta's form ID |
| `page_id` | VARCHAR(100) | |
| `ad_account_id` | VARCHAR(100) | |
| `created_at` | TIMESTAMP | Auto-set on insert |

---

## Local Development

```bash
# Install dependencies
npm install

# Create .env file (copy variables from Vercel)
cp .env.example .env

# Start with live reload
npm run dev
```

Server runs on `http://localhost:3005` by default.

---

## Webhook Setup

The Meta webhook is registered at:
```
https://voxa-crm-backend.vercel.app/webhook
```

For webhook delivery to work:
1. The app must be subscribed to the page for `leadgen` events
2. "Attach a client certificate" must be **OFF** in the Meta Developer Portal — Vercel does not support mTLS
3. The `DATABASE_URL` must use the Neon pooler URL without `channel_binding=require`

---

## Token Renewal

The Meta Page Access Token expires approximately every 60 days. To renew:

1. Generate a new short-lived token in Meta Graph API Explorer
2. Exchange for a long-lived token:
   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={META_APP_ID}
     &client_secret={META_APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
3. Update `META_PAGE_ACCESS_TOKEN` in Vercel environment variables
4. Redeploy

---

## Frontend Integration

Set this environment variable in the frontend Vercel project:

```env
VITE_META_API_URL=https://voxa-crm-backend.vercel.app
```

CORS is configured to accept requests from `https://voxa-crm.vercel.app`, `localhost:5173`, and `localhost:3000`.

---

## Migrating from Vercel to QCloud

When the backend and frontend are redeployed on QCloud, update the following in order:

### 1. Backend Code — 2 hardcoded frontend URLs

**`src/controllers/formController.js` — lines 89–90**

These two values are sent to Meta when creating a lead form and must point to the live frontend:

```js
// Change both of these from:
privacy_policy: JSON.stringify(privacy_policy || { url: 'https://voxa-crm.vercel.app/privacy-policy' }),
follow_up_action_url: 'https://voxa-crm.vercel.app',

// To:
privacy_policy: JSON.stringify(privacy_policy || { url: 'https://<frontend-qcloud-domain>/privacy-policy' }),
follow_up_action_url: 'https://<frontend-qcloud-domain>',
```

> These only affect newly created forms. Existing Meta forms already have the old URLs baked in — they cannot be updated (Meta forms are immutable after creation).

---

### 2. Backend Environment Variables

Update these in the QCloud backend deployment (equivalent of Vercel → Environment Variables):

| Variable | Old Value | New Value |
|---|---|---|
| `FRONTEND_URL` | `https://voxa-crm.vercel.app` | `https://<frontend-qcloud-domain>` |

This controls the CORS `Access-Control-Allow-Origin` header. If not set, the backend falls back to allowing all origins (`*`).

---

### 3. Frontend Environment Variable

In the QCloud **frontend** deployment:

| Variable | Old Value | New Value |
|---|---|---|
| `VITE_META_API_URL` | `https://voxa-crm-backend.vercel.app` | `https://<backend-qcloud-domain>` |

This is the base URL used in every `fetch()` call in the React app.

---

### 4. Meta Developer Portal — Webhook Callback URL

Go to **developers.facebook.com → your app → Webhooks tab** and update the callback URL:

| | URL |
|---|---|
| Old | `https://voxa-crm-backend.vercel.app/webhook` |
| New | `https://<backend-qcloud-domain>/webhook` |

Meta will re-verify the endpoint on save — the backend must be live and responding before updating this.

---

### 5. Deployment Config

`vercel.json` is Vercel-specific and will not apply on QCloud. Replace it with the equivalent QCloud entry point config. The key setting it provides is:

```json
{ "src": "/(.*)", "dest": "app.js" }
```

All requests must be routed to `app.js` — replicate this in QCloud's routing or server config.

---

### Migration Checklist

- [ ] Backend deployed on QCloud and health check (`GET /`) returns 200
- [ ] `FRONTEND_URL` env var set to QCloud frontend URL on the backend
- [ ] `VITE_META_API_URL` env var set to QCloud backend URL on the frontend
- [ ] `src/controllers/formController.js` lines 89–90 updated and redeployed
- [ ] Meta Developer Portal webhook callback URL updated to QCloud backend URL
- [ ] Webhook re-verification successful in Meta portal
- [ ] "Attach a client certificate" remains OFF in Meta webhook settings
- [ ] `DATABASE_URL` (Neon) carried over unchanged — Neon is cloud-agnostic

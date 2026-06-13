# VOXA CRM — Meta Lead Ads Integration
## Complete Backend & Integration Roadmap
**Node.js | PostgreSQL (Neon) | Vercel | Meta Graph API v19.0**

---

## System Architecture Overview

This integration adds a completely separate Node.js backend service alongside the existing PHP CRM backend. Both services share no code but serve the same React frontend deployed on Vercel.

| Layer | Technology | Purpose | Deployed On |
|---|---|---|---|
| Frontend | React | Form Generator UI + Lead Capture Screen | Vercel — voxa-crm.vercel.app |
| CRM Backend | PHP | Calls, Agents, Dashboard, Auth | Qcloud — 172.16.172/cms (VPN only) |
| Meta Service | Node.js + Express | Meta API, Webhook, Lead saving | Vercel — separate project |
| CRM Database | MySQL | Existing CRM data | Qcloud (existing) |
| Meta Database | PostgreSQL — Neon | Leads, Forms from Meta | Neon (new — cloud hosted) |

```
React (voxa-crm.vercel.app)
   |
   |--- PHP API (VPN) ----------> CRM data (calls, agents, dashboard)
   |
   |--- Node.js API (Vercel) ---> Meta operations only
                  |
                  |--- PostgreSQL Neon (leads, meta_forms tables)
                  |--- Meta Graph API v19.0
                  |
                  <--- Meta fires webhook here when lead submitted
```

> **INFO:** The PHP backend and its MySQL database are completely untouched by this integration. The Node.js Meta Service is fully independent with its own PostgreSQL database on Neon.

---

## Complete User Journey

### Journey 1 — Agent Creates and Publishes a Form to Meta

1. Agent opens the VOXA portal at voxa-crm.vercel.app and navigates to Form Generator
2. Agent selects fields from the available list — Full Name, Email, Phone, Budget Range, Property Type, Bedrooms etc.
3. The Form Generator builds a JSON output of the selected fields in real time
4. Agent gives the form a name and clicks **Publish to Meta Ads** button
5. React sends the form JSON via POST request to the Node.js Meta Service on Vercel
6. Node.js receives the JSON, formats it to Meta's required structure, and calls Meta Marketing API
```
POST https://graph.facebook.com/v19.0/act_1844573786356037/leadgen_forms
```
7. Meta creates the form on the client's Facebook Page and returns a unique Form ID
8. Node.js saves the Form ID, form name, and creation date to PostgreSQL `meta_forms` table
9. Portal shows success message — form is now live on Meta and ready to be attached to an ad

---

### Journey 2 — Prospect Fills the Form on Facebook / Instagram

1. Client attaches the published form to their ad campaign in Meta Ads Manager
2. Ad goes live on Facebook or Instagram
3. A prospect sees the ad and clicks — Meta's native lead form opens instantly with their details pre-filled
4. Prospect submits the form
5. Meta immediately fires a POST request to the Node.js webhook endpoint on Vercel
6. Node.js webhook receives the event, extracts the `leadgen_id` from the payload
7. Node.js calls Meta Graph API to fetch the full lead details using the `leadgen_id`
```
GET https://graph.facebook.com/v19.0/{leadgen_id}?access_token={PAGE_ACCESS_TOKEN}
```
8. Node.js saves the lead — full name, email, phone, form ID, timestamp — to PostgreSQL `leads` table
9. Node.js responds 200 to Meta within 5 seconds — **this is mandatory**

---

### Journey 3 — Agent Sees Lead on Portal

1. React Lead Capture screen is polling the Node.js API every 30 seconds
2. On next poll it calls `GET /api/leads` on the Node.js Vercel service
3. Node.js reads from PostgreSQL `leads` table and returns the data
4. New lead appears on the Lead Capture screen — name, phone, email, source form, timestamp
5. Agent sees the lead and makes the follow-up call directly from the portal

---

## Phase 1 — PostgreSQL Database Setup on Neon

### Step 1.1 — Create Neon Account and Database

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Click **New Project** — name it `voxa-meta` or `voxa-crm-meta`
3. Neon will create a database and give you a connection string like:
```
postgresql://username:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```
4. Copy this connection string — it goes in your Node.js `.env` file as `DATABASE_URL`

### Step 1.2 — Create Tables

Run these SQL statements in the Neon SQL Editor (available in their dashboard):

```sql
CREATE TABLE IF NOT EXISTS meta_forms (
  id            SERIAL PRIMARY KEY,
  form_name     VARCHAR(255) NOT NULL,
  meta_form_id  VARCHAR(100) NOT NULL,
  page_id       VARCHAR(100),
  ad_account_id VARCHAR(100),
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  full_name      VARCHAR(255),
  email          VARCHAR(255),
  phone          VARCHAR(50),
  form_id        VARCHAR(100),
  form_name      VARCHAR(255),
  lead_status    VARCHAR(50) DEFAULT 'new',
  assigned_agent VARCHAR(100),
  raw_data       TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);
```

> **NOTE:** Neon free tier is more than enough for this use case. It supports up to 3GB storage and has automatic scaling. No cost involved for initial setup and testing.

---

## Phase 2 — Node.js Meta Service — Folder Structure & Setup

### Step 2.1 — Folder Structure

```
voxa-meta-service/
  src/
    routes/
      webhook.js          <- Meta fires POST here on lead submission
      forms.js            <- React calls POST here to publish form to Meta
      leads.js            <- React calls GET here to fetch leads
    controllers/
      webhookController.js
      formController.js
      leadsController.js
    config/
      db.js               <- PostgreSQL Neon connection
  app.js                  <- Express server entry point
  .env                    <- All credentials — never commit this
  .gitignore
  package.json
  vercel.json             <- Vercel deployment config
```

### Step 2.2 — package.json Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2"
  }
}
```

### Step 2.3 — Environment Variables (.env)

> **CRITICAL:** Never commit the `.env` file to GitHub. Add it to `.gitignore` immediately. These values are added manually on Vercel dashboard as Environment Variables after deployment.

```env
# Meta Credentials
META_APP_ID=your_app_id_here
META_APP_SECRET=your_app_secret_here
META_PAGE_ACCESS_TOKEN=your_long_lived_token_here
META_PAGE_ID=116432581557748
META_AD_ACCOUNT_ID=act_1844573786356037
META_WEBHOOK_VERIFY_TOKEN=generate_this_yourself_random_string

# Database
DATABASE_URL=your_neon_connection_string_here

# Server
PORT=3000
FRONTEND_URL=https://voxa-crm.vercel.app
```

> **NOTE:** To generate `META_WEBHOOK_VERIFY_TOKEN` run this in terminal:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
> This is created by you — not provided by client.

### Step 2.4 — vercel.json

```json
{
  "version": 2,
  "builds": [{ "src": "app.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "app.js" }]
}
```

---

## Phase 3 — Node.js Backend Code

### Step 3.1 — app.js

```javascript
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');

const webhookRoutes = require('./src/routes/webhook');
const formRoutes    = require('./src/routes/forms');
const leadsRoutes   = require('./src/routes/leads');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(bodyParser.json());

app.use('/webhook',    webhookRoutes);
app.use('/api/forms',  formRoutes);
app.use('/api/leads',  leadsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Meta service running on port', PORT));

module.exports = app;
```

### Step 3.2 — src/config/db.js

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
```

### Step 3.3 — src/routes/webhook.js

```javascript
const express = require('express');
const router  = express.Router();
const { verifyWebhook, receiveWebhook } = require('../controllers/webhookController');

router.get('/',  verifyWebhook);   // Meta calls this once to verify
router.post('/', receiveWebhook);  // Meta calls this on every lead

module.exports = router;
```

### Step 3.4 — src/controllers/webhookController.js

```javascript
const axios = require('axios');
const pool  = require('../config/db');

// Meta webhook verification
exports.verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// Receive lead from Meta
exports.receiveWebhook = async (req, res) => {
  res.status(200).send('EVENT_RECEIVED'); // respond fast — Meta requires < 5 sec

  try {
    const entry  = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== 'leadgen') return;

    const leadgenId = change.value.leadgen_id;
    const token     = process.env.META_PAGE_ACCESS_TOKEN;
    const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${token}`;

    const { data } = await axios.get(url);

    // Parse field_data into key:value
    const fields = {};
    data.field_data.forEach(f => { fields[f.name] = f.values?.[0] || ''; });

    await pool.query(
      `INSERT INTO leads (full_name, email, phone, form_id, raw_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fields.full_name      || '',
        fields.email          || '',
        fields.phone_number   || '',
        data.form_id          || '',
        JSON.stringify(data)
      ]
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
};
```

### Step 3.5 — src/controllers/formController.js

```javascript
const axios = require('axios');
const pool  = require('../config/db');

exports.createForm = async (req, res) => {
  try {
    const { name, questions, privacy_policy } = req.body;
    const token       = process.env.META_PAGE_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    const pageId      = process.env.META_PAGE_ID;

    const payload = {
      name,
      questions:      JSON.stringify(questions),
      privacy_policy: JSON.stringify(privacy_policy ||
        { url: 'https://voxa-crm.vercel.app/privacy' }),
      locale:       'en_US',
      page_id:      pageId,
      access_token: token
    };

    const url = `https://graph.facebook.com/v19.0/${adAccountId}/leadgen_forms`;
    const { data } = await axios.post(
      url,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    await pool.query(
      'INSERT INTO meta_forms (form_name, meta_form_id, page_id, ad_account_id) VALUES ($1,$2,$3,$4)',
      [name, data.id, pageId, adAccountId]
    );

    res.json({ success: true, form_id: data.id });
  } catch (err) {
    console.error('Form creation error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};
```

### Step 3.6 — src/controllers/leadsController.js

```javascript
const pool = require('../config/db');

exports.getLeads = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, form_id, form_name,
              lead_status, created_at
       FROM leads
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, leads: result.rows });
  } catch (err) {
    console.error('Get leads error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
```

---

## Phase 4 — Frontend Wiring (React)

Claude Code will handle the exact component wiring after accessing the repo. Below is what needs to be added.

### Step 4.1 — Environment Variable in React

Add to the React project `.env` on Vercel:

```env
VITE_META_API_URL=https://voxa-meta-service.vercel.app
```

### Step 4.2 — Form Generator Component

When user clicks **Publish to Meta Ads** button:

```javascript
const publishToMeta = async () => {
  const formJson = {
    name: formName,
    questions: selectedFields.map(field => ({
      type:  field.metaType,   // e.g. FULL_NAME, EMAIL, PHONE
      label: field.label,
      key:   field.key
    })),
    privacy_policy: { url: 'https://voxa-crm.vercel.app/privacy' }
  };

  const res = await fetch(`${import.meta.env.VITE_META_API_URL}/api/forms/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(formJson)
  });
  const data = await res.json();
  if (data.success) {
    // show success toast — form published to Meta
  } else {
    // show error message
  }
};
```

### Step 4.3 — Lead Capture Component

Add polling to fetch leads every 30 seconds:

```javascript
useEffect(() => {
  const fetchLeads = async () => {
    const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/api/leads`);
    const data = await res.json();
    if (data.success) setLeads(data.leads);
  };
  fetchLeads();
  const interval = setInterval(fetchLeads, 30000);
  return () => clearInterval(interval);
}, []);
```

---

## Phase 5 — Local Testing with ngrok

### Step 5.1 — Run Everything Locally

1. Start Node.js meta service locally:
```bash
cd voxa-meta-service && node app.js
```
2. In a second terminal, start ngrok:
```bash
ngrok http 3000
```
3. ngrok gives you a temporary public HTTPS URL:
```
https://abc123.ngrok.io
```

### Step 5.2 — Register Webhook on Meta

1. Go to developers.facebook.com — log in with your developer Facebook account (added by client as Developer role on their App)
2. Open the client's App
3. Click **Webhooks** in left sidebar
4. Click **Add Subscription** — select **Page**
5. Enter Callback URL: `https://abc123.ngrok.io/webhook`
6. Enter Verify Token: your `META_WEBHOOK_VERIFY_TOKEN` value from `.env`
7. Click **Verify and Save** — Meta pings your local server through ngrok instantly
8. Under Subscription Fields check: `leadgen`

### Step 5.3 — Subscribe Facebook Page

Run this once in Postman or via curl:

```
POST https://graph.facebook.com/v19.0/116432581557748/subscribed_apps
  ?access_token={PAGE_ACCESS_TOKEN}
  &subscribed_fields=leadgen
```

Expected response: `{ "success": true }`

### Step 5.4 — Test Using Meta Lead Testing Tool

1. Go to developers.facebook.com → your App → **Lead Ads Testing Tool**
2. Select the Facebook Page
3. Select the form that was published from the portal
4. Click **Create Lead**
5. Check your PostgreSQL leads table on Neon — lead should be saved
6. Check the React Lead Capture screen — lead should appear

> **CRITICAL:** Every time you restart ngrok the URL changes. You must re-register the webhook on Meta with the new URL each time during local testing. This is only for local testing — on Vercel you have a permanent URL.

---

## Phase 6 — Deploy Node.js to Vercel

### Step 6.1 — Push to GitHub

1. Create a new GitHub repo for `voxa-meta-service`
2. Push the code — make sure `.env` is in `.gitignore` and NOT pushed

### Step 6.2 — Deploy on Vercel

1. Go to vercel.com — **New Project**
2. Import the `voxa-meta-service` GitHub repo
3. Framework Preset: select **Other**
4. Do NOT add environment variables yet
5. Click **Deploy**

### Step 6.3 — Add Environment Variables on Vercel

1. Go to your deployed project on Vercel
2. **Settings → Environment Variables**
3. Add every variable from your `.env` file one by one:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_PAGE_ACCESS_TOKEN`
   - `META_PAGE_ID`
   - `META_AD_ACCOUNT_ID`
   - `META_WEBHOOK_VERIFY_TOKEN`
   - `DATABASE_URL`
   - `FRONTEND_URL`
4. Redeploy after adding variables — Settings → Deployments → Redeploy

### Step 6.4 — Your Permanent Webhook URL

After deployment your permanent URL will be:

```
https://voxa-meta-service.vercel.app/webhook
```

Use this URL to re-register the webhook on Meta Developer Portal — replacing the ngrok URL used during testing. **This URL never changes.**

---

## Phase 7 — Final Meta Registration and Go Live

### Step 7.1 — Re-register Webhook with Permanent URL

1. Go to Meta Developer Portal — client's App — Webhooks
2. Update Callback URL to: `https://voxa-meta-service.vercel.app/webhook`
3. Verify Token stays the same
4. Click Verify and Save

### Step 7.2 — Re-subscribe Facebook Page

1. Run the page subscription call again with the live server
2. Confirm `{ "success": true }` is returned

### Step 7.3 — End to End Test on Live

1. Use Meta Lead Testing Tool again — against the live Vercel deployment
2. Confirm lead saves to Neon PostgreSQL
3. Confirm lead appears on voxa-crm.vercel.app Lead Capture screen

### Step 7.4 — Client Launches Ad

1. Client goes to Meta Ads Manager
2. Creates a new campaign — objective: **Lead Generation**
3. Selects the form published from the VOXA portal
4. Sets audience, budget, and launches
5. Real leads start flowing into portal automatically from this point

---

## Complete Go-Live Checklist

| # | Task | Done |
|---|---|---|
| 1 | Neon PostgreSQL account created and connection string saved | |
| 2 | `leads` and `meta_forms` tables created in Neon | |
| 3 | Node.js meta-service folder created with correct structure | |
| 4 | All environment variables added to `.env` | |
| 5 | `vercel.json` created in root of meta-service | |
| 6 | React Form Generator wired to `POST /api/forms/create` | |
| 7 | React Lead Capture wired to `GET /api/leads` with 30 sec polling | |
| 8 | Local testing done using ngrok | |
| 9 | Meta Lead Testing Tool confirmed lead saved to Neon | |
| 10 | Meta Lead Testing Tool confirmed lead appears on portal | |
| 11 | Code pushed to GitHub (`.env` excluded) | |
| 12 | Node.js deployed to Vercel as separate project | |
| 13 | All environment variables added on Vercel dashboard | |
| 14 | Webhook re-registered on Meta with permanent Vercel URL | |
| 15 | Page re-subscribed to `leadgen` events | |
| 16 | Final end-to-end test on live Vercel deployment passed | |
| 17 | Client informed to attach form to their ad campaign in Ads Manager | |
| 18 | Privacy policy page deployed on Vercel for production use | |

---

## Pending Items From Client

> **CRITICAL:** Privacy Policy URL is still missing. The current integration uses a temporary placeholder at `voxa-crm.vercel.app/privacy` for testing. Before the client launches real ads, a proper privacy policy page must exist on their company website and that URL must be updated in `formController.js` and the React form publish call.

| Item | Status | Action Required |
|---|---|---|
| Meta App ID | Received | In `.env` |
| Meta App Secret | Received — regenerate new one | Old one was exposed — client must reset and provide new |
| Page Access Token | Received — regenerate new one | Old one was exposed — client must revoke and provide new |
| Facebook Page ID | Received | In `.env` |
| Ad Account ID | Received | In `.env` — format: `act_1844573786356037` |
| `leads_retrieval` permission | Pending Meta approval | Client must submit App Review request |
| `pages_manage_ads` permission | Pending Meta approval | Client must submit App Review request |
| Privacy Policy URL | Missing | Client must provide real URL before go-live |
| Developer added to Meta App | Confirm with client | Client must add developer Facebook account as Developer role |

---

*VOXA CRM — Meta Integration Roadmap — VOXA Development Team — Confidential*

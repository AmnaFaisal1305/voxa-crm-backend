# VOXA Meta Integration — API Documentation
**For Frontend Developers**
**Base URL:** `https://voxa-crm-backend.vercel.app`
**Meta Graph API Version:** v25.0
**Last Updated:** June 2026

---

## System Overview

The VOXA Meta Integration backend is a standalone Node.js service deployed on Vercel. It sits between the React frontend and Meta Lead Ads — handling form publishing, lead capture via webhook, and serving leads to the portal.

```
┌─────────────────────────────────────────────────────────────────┐
│                      VOXA System Map                            │
└─────────────────────────────────────────────────────────────────┘

  React Frontend (voxa-crm.vercel.app)
        │
        ├──── POST /api/forms/create ──────────────────────────────┐
        │                                                          │
        └──── GET  /api/leads  (every 30 sec) ─────────────────┐  │
                                                               │  │
                                                               ▼  ▼
                                          Node.js Backend (voxa-crm-backend.vercel.app)
                                                    │             │
                                    ┌───────────────┘             └──────────────┐
                                    ▼                                            ▼
                           PostgreSQL (Neon)                     Meta Graph API v25.0
                           leads table                           (Facebook Page)
                           meta_forms table
                                    ▲
                                    │  INSERT lead
                                    │
                          Node.js Backend
                                    ▲
                                    │  POST /webhook (automatic)
                                    │
                              Meta Platform
                         (fires on form submit)
```

---

## API Flows

### Flow 1 — Agent Publishes a Form to Meta

This flow runs when an agent builds a form in the Form Generator and clicks **Publish to Meta Ads**.

```
Agent clicks "Publish to Meta Ads"
        │
        ▼
React collects form name + selected fields
        │
        ▼
POST /api/forms/create
{ name, questions[], privacy_policy }
        │
        ▼
Backend sanitizes questions
(strips label/key from built-in types)
        │
        ▼
Backend calls Meta Graph API v25.0
POST graph.facebook.com/v25.0/{pageId}/leadgen_forms
        │
        ├── Meta rejects ──► Backend returns { success: false, error: {...} }
        │                               │
        │                               ▼
        │                    React shows error toast
        │
        └── Meta accepts ──► Returns form_id
                │
                ▼
        Backend saves to PostgreSQL
        meta_forms table (form_name, meta_form_id, page_id)
                │
                ▼
        Backend returns { success: true, form_id: "..." }
                │
                ▼
        React shows success toast
        Form is now live on the Facebook Page
```

---

### Flow 2 — Prospect Submits Form → Lead Appears on Portal

This flow is fully automatic. The frontend only participates at the end via polling.

```
Prospect sees ad on Facebook / Instagram
        │
        ▼
Prospect submits the Lead Ads form
        │
        ▼
Meta fires POST /webhook to backend (automatic, within seconds)
{ entry[].changes[].field: "leadgen", leadgen_id: "..." }
        │
        ▼
Backend immediately responds 200 EVENT_RECEIVED
(Meta requires response within 5 seconds)
        │
        ▼ (async, after 200 is sent)
Backend calls Meta Graph API
GET graph.facebook.com/v25.0/{leadgen_id}?access_token=...
        │
        ▼
Backend maps field_data to full_name / email / phone
        │
        ▼
Backend inserts into PostgreSQL leads table
        │
        ▼
[30 seconds later] React polls GET /api/leads
        │
        ▼
New lead appears on Lead Capture screen
Agent sees: name, phone, email, form source, timestamp
```

---

### Flow 3 — Agent Views Leads (Polling)

```
React mounts Lead Capture screen
        │
        ▼
Immediate: GET /api/leads
        │
        ▼
Backend queries PostgreSQL
SELECT * FROM leads ORDER BY created_at DESC LIMIT 100
        │
        ▼
Returns leads array to React
        │
        ▼
React renders lead cards on screen
        │
        ▼
setInterval: repeat every 30,000ms (30 seconds)
        │
        └──► GET /api/leads ──► update state ──► UI refreshes
```

---

## Setup — Environment Variable

Add this single variable to the React project on Vercel:

**Vercel → voxa-crm (frontend project) → Settings → Environment Variables**

```env
VITE_META_API_URL=https://voxa-crm-backend.vercel.app
```

Reference it in all API calls as:
```js
import.meta.env.VITE_META_API_URL
```

---

## CORS — Allowed Origins

The backend accepts requests from these origins only:

| Origin | Use |
|---|---|
| `https://voxa-crm.vercel.app` | Production frontend |
| `http://localhost:5173` | Local dev — Vite default |
| `http://localhost:3000` | Local dev — alternative port |

---

## Endpoints

---

### GET /

Health check. Confirms the service is running.

**Request**
```
GET https://voxa-crm-backend.vercel.app/
```

**Response — 200**
```json
{
  "status": "healthy",
  "service": "VOXA Meta Integration API",
  "timestamp": "2026-06-14T12:47:11.143Z"
}
```

**React usage**
```js
const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/`);
const data = await res.json();
// data.status === 'healthy'
```

---

### POST /api/forms/create

Publishes a Lead Ads form to the Facebook Page and saves a record to the database.
Call this when the agent clicks **Publish to Meta Ads** in the Form Generator.

**Request**
```
POST https://voxa-crm-backend.vercel.app/api/forms/create
Content-Type: application/json
```

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Form name — visible in Meta Ads Manager |
| `questions` | array | Yes | Array of question objects — see structure below |
| `privacy_policy` | object | No | Defaults to `{ "url": "https://voxa-crm.vercel.app/privacy-policy" }` |

---

#### Question Object Rules

Meta has two categories of question types. **The frontend sends both the same way** — the backend automatically handles the difference before calling Meta.

**Built-in types** — Meta pre-fills these from the user's Facebook profile. Send only `type`:

| `type` | What it captures | Pre-filled by Meta |
|---|---|---|
| `FULL_NAME` | First + last name | Yes |
| `EMAIL` | Email address | Yes |
| `PHONE` | Phone number | Yes |
| `DATE_TIME` | Date / time | Yes |
| `CITY` | City | Yes |
| `STATE` | State / emirate | Yes |
| `COUNTRY` | Country | Yes |
| `ZIP` | Zip / postal code | Yes |
| `GENDER` | Gender | Yes |
| `WORK_EMAIL` | Work email | Yes |
| `WORK_PHONE_NUMBER` | Work phone | Yes |

**Custom type** — The user types the answer manually. Send `type`, `label`, and `key`:

| `type` | `label` | `key` |
|---|---|---|
| `CUSTOM` | Display text shown on the form | Snake_case identifier used in webhook data |

> **Important:** For built-in types, the backend strips `label` and `key` before sending to Meta. You may still include them in your payload for your own reference — they will be ignored for built-in types.

---

**Example Request Body**
```json
{
  "name": "VOXA Property Inquiry — June 2026",
  "questions": [
    { "type": "FULL_NAME" },
    { "type": "EMAIL" },
    { "type": "PHONE" },
    { "type": "CUSTOM", "label": "Budget Range",   "key": "budget_range"   },
    { "type": "CUSTOM", "label": "Property Type",  "key": "property_type"  },
    { "type": "CUSTOM", "label": "Preferred Area", "key": "preferred_area" }
  ],
  "privacy_policy": {
    "url": "https://voxa-crm.vercel.app/privacy-policy"
  }
}
```

---

**Response — 200 Success**
```json
{
  "success": true,
  "form_id": "2035082244044153"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | `true` on success |
| `form_id` | string | Meta's unique ID for the created form |

**Response — 400 Validation Error**
```json
{
  "success": false,
  "error": "Missing required fields: name and questions are required."
}
```

**Response — 500 Meta API Error**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error from Meta",
    "type": "OAuthException",
    "code": 100
  }
}
```

---

**Complete React Implementation**
```jsx
const [isPublishing, setIsPublishing] = useState(false);

const publishToMeta = async () => {
  if (!formName || selectedFields.length === 0) return;

  setIsPublishing(true);
  try {
    const res = await fetch(`${import.meta.env.VITE_META_API_URL}/api/forms/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        questions: selectedFields.map(field => ({
          type:  field.metaType,          // e.g. 'FULL_NAME', 'CUSTOM'
          label: field.label,             // backend strips this for built-in types
          key:   field.key                // backend strips this for built-in types
        })),
        privacy_policy: { url: 'https://voxa-crm.vercel.app/privacy-policy' }
      })
    });

    const data = await res.json();

    if (data.success) {
      // show success toast
      console.log('Form live on Meta. Form ID:', data.form_id);
    } else {
      // show error toast
      console.error('Meta rejected the form:', data.error);
    }
  } catch (err) {
    console.error('Network error:', err);
  } finally {
    setIsPublishing(false);
  }
};
```

---

### GET /api/leads

Returns the 100 most recent captured leads from the database, ordered newest first.
Poll this every 30 seconds on the Lead Capture screen.

**Request**
```
GET https://voxa-crm-backend.vercel.app/api/leads
```

No body. No query parameters.

**Response — 200 Success**
```json
{
  "success": true,
  "leads": [
    {
      "id": 1,
      "full_name": "Mohammed Al Rashid",
      "email": "mohammed@example.com",
      "phone": "+971501234567",
      "form_id": "2035082244044153",
      "form_name": null,
      "lead_status": "new",
      "assigned_agent": null,
      "created_at": "2026-06-14T12:47:11.143Z"
    }
  ]
}
```

**Lead Object Fields**

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Database primary key |
| `full_name` | string | From `full_name` or `name` field on the form |
| `email` | string | From `email` field |
| `phone` | string | From `phone_number` or `phone` field |
| `form_id` | string | Meta form ID the lead came from |
| `form_name` | string \| null | Populated only if the form was created via this system |
| `lead_status` | string | Always `"new"` on arrival — update via DB manually |
| `assigned_agent` | string \| null | `null` until assigned manually |
| `created_at` | string | ISO 8601 UTC timestamp |

**Response — 500 Error**
```json
{
  "success": false,
  "error": "error message"
}
```

---

**Complete React Implementation — 30-second polling**
```jsx
const [leads, setLeads]     = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError]     = useState(null);

useEffect(() => {
  const fetchLeads = async () => {
    try {
      const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/api/leads`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  fetchLeads();                                    // run immediately on mount
  const interval = setInterval(fetchLeads, 30000); // then every 30 seconds
  return () => clearInterval(interval);            // cleanup on unmount
}, []);
```

**Rendering leads**
```jsx
{leads.map(lead => (
  <div key={lead.id}>
    <p>{lead.full_name}</p>
    <p>{lead.phone}</p>
    <p>{lead.email}</p>
    <p>{lead.lead_status}</p>
    <p>{new Date(lead.created_at).toLocaleString()}</p>
  </div>
))}
```

---

### GET /webhook — Internal (Meta only)

Meta calls this once to verify the webhook subscription during setup.
**The frontend never calls this endpoint.**

```
Meta → GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
Backend → responds with the challenge string if token matches
```

| Response | When |
|---|---|
| `200` + challenge string | Token matches — webhook verified |
| `403 Forbidden` | Token mismatch |

---

### POST /webhook — Internal (Meta only)

Meta calls this automatically every time a prospect submits a Lead Ads form.
**The frontend never calls this endpoint.**

```
Meta → POST /webhook
{
  "object": "page",
  "entry": [{
    "changes": [{
      "field": "leadgen",
      "value": { "leadgen_id": "...", "form_id": "...", "page_id": "..." }
    }]
  }]
}
```

**What the backend does internally:**

```
1. Immediately respond 200 EVENT_RECEIVED  ← Meta requires this within 5 seconds
2. Extract leadgen_id from payload
3. GET graph.facebook.com/v25.0/{leadgen_id}?access_token=...
4. Map field_data array to key-value pairs:
     full_name  ← field name "full_name" or "name"
     email      ← field name "email"
     phone      ← field name "phone_number" or "phone"
     (all other fields stored in raw_data as JSON)
5. INSERT into leads table
```

Non-leadgen events (e.g. page feed updates) are received with `200 EVENT_RECEIVED` and silently ignored.

---

## Error Handling Reference

| HTTP Status | `success` | When |
|---|---|---|
| `200` | `true` | Request succeeded |
| `400` | `false` | `name` or `questions` missing from request body |
| `403` | — | Webhook token mismatch (Meta-facing only) |
| `500` | `false` | Meta API error or database error |

**Always check both the HTTP status and the `success` field.** A `500` response includes a `data.error` object with the exact message from Meta or the database.

```js
const res  = await fetch(...);
const data = await res.json();

if (!res.ok || !data.success) {
  const message = typeof data.error === 'string'
    ? data.error
    : data.error?.message || 'Unknown error';
  showErrorToast(message);
  return;
}
// proceed with data
```

---

## Database Schema Reference

Two tables in PostgreSQL (Neon). The frontend does not interact with these directly — they are read/written by the backend.

**`leads` table** — one row per captured lead

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL | Primary key |
| `full_name` | VARCHAR(255) | |
| `email` | VARCHAR(255) | |
| `phone` | VARCHAR(50) | |
| `form_id` | VARCHAR(100) | Meta form ID |
| `form_name` | VARCHAR(255) | Null if form not created via this system |
| `lead_status` | VARCHAR(50) | Default `'new'` |
| `assigned_agent` | VARCHAR(100) | Null by default |
| `raw_data` | TEXT | Full JSON from Meta for that lead |
| `created_at` | TIMESTAMP | Auto set on insert |

**`meta_forms` table** — one row per published form

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL | Primary key |
| `form_name` | VARCHAR(255) | Name given at publish time |
| `meta_form_id` | VARCHAR(100) | Meta's form ID |
| `page_id` | VARCHAR(100) | Facebook Page ID |
| `ad_account_id` | VARCHAR(100) | Meta Ad Account ID |
| `created_at` | TIMESTAMP | Auto set on insert |

---

## Quick Reference

| Method | Endpoint | Caller | Purpose |
|---|---|---|---|
| `GET` | `/` | Frontend | Health check |
| `POST` | `/api/forms/create` | Frontend | Publish Lead Ads form to Meta |
| `GET` | `/api/leads` | Frontend (every 30s) | Fetch captured leads |
| `GET` | `/webhook` | Meta only | Webhook verification |
| `POST` | `/webhook` | Meta only | Receive new lead events |

---

## Token Expiry Notice

The current Meta Page Access Token expires **~August 2026 (60 days)**. Before it expires:

1. Generate a new short-lived Page Access Token from Meta Graph API Explorer
2. Exchange it for a long-lived token:
   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={META_APP_ID}
     &client_secret={META_APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
3. Update `META_PAGE_ACCESS_TOKEN` in Vercel → Settings → Environment Variables
4. Redeploy

---

*VOXA CRM — Meta Integration API Documentation — VOXA Development Team — Confidential*

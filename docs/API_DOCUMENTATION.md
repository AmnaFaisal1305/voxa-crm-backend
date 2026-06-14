# VOXA Meta Integration — API Documentation
**For Frontend Developers**
**Base URL:** `https://voxa-crm-backend.vercel.app`
**Graph API Version used internally:** v22.0

---

## Overview

This Node.js backend is the bridge between the VOXA React frontend and Meta Lead Ads. It handles two frontend-facing concerns:

1. **Publishing forms** — React sends a form definition → backend creates the form on Meta and saves it
2. **Fetching leads** — React polls this API to get leads that Meta fired via webhook

The webhook endpoints (`/webhook`) are internal — Meta calls them directly, the frontend never touches them.

---

## CORS

The API accepts requests from:

| Origin | Environment |
|---|---|
| `https://voxa-crm.vercel.app` | Production |
| `http://localhost:5173` | Local dev (Vite) |
| `http://localhost:3000` | Local dev (CRA/other) |

Set the base URL in your React `.env`:

```env
VITE_META_API_URL=https://voxa-crm-backend.vercel.app
```

Access it in code as `import.meta.env.VITE_META_API_URL`.

---

## Endpoints

---

### GET /

Health check. Use this to confirm the service is up.

**Request**
```
GET https://voxa-crm-backend.vercel.app/
```

**Response — 200 OK**
```json
{
  "status": "healthy",
  "service": "VOXA Meta Integration API",
  "timestamp": "2026-06-14T11:52:31.119Z"
}
```

**Usage in React**
```js
const res = await fetch(`${import.meta.env.VITE_META_API_URL}/`);
const data = await res.json();
// data.status === 'healthy'
```

---

### POST /api/forms/create

Publishes a new Lead Ads form to Meta (Facebook Page) and saves it to the database. Call this when the agent clicks **Publish to Meta Ads** in the Form Generator.

**Request**
```
POST https://voxa-crm-backend.vercel.app/api/forms/create
Content-Type: application/json
```

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Internal name for the form (visible in Meta Ads Manager) |
| `questions` | array | Yes | Array of question objects (see structure below) |
| `privacy_policy` | object | No | Defaults to `{ "url": "https://voxa-crm.vercel.app/privacy-policy" }` |

**Question Object Structure**

Each item in `questions` must follow the Meta Lead Ads format:

| Field | Type | Description |
|---|---|---|
| `type` | string | Meta field type constant — see supported types below |
| `label` | string | Display label shown to the user on the form |
| `key` | string | Internal key used to identify the answer in webhook data |

**Supported Meta Field Types**

| `type` value | What it captures |
|---|---|
| `FULL_NAME` | First + last name (pre-filled by Meta) |
| `EMAIL` | Email address (pre-filled by Meta) |
| `PHONE` | Phone number (pre-filled by Meta) |
| `CUSTOM` | Free-text field using custom `label` and `key` |

> Note: `FULL_NAME`, `EMAIL`, and `PHONE` are Meta built-in types — Meta pre-fills them from the user's profile. Custom fields require the user to type.

**Example Request Body**
```json
{
  "name": "VOXA Property Inquiry — June 2026",
  "questions": [
    { "type": "FULL_NAME",  "label": "Full Name",    "key": "full_name"    },
    { "type": "EMAIL",      "label": "Email",         "key": "email"        },
    { "type": "PHONE",      "label": "Phone Number",  "key": "phone_number" },
    { "type": "CUSTOM",     "label": "Budget Range",  "key": "budget_range" },
    { "type": "CUSTOM",     "label": "Property Type", "key": "property_type"}
  ],
  "privacy_policy": {
    "url": "https://voxacrmclient.com/privacy-policy"
  }
}
```

**Response — 200 OK (Success)**
```json
{
  "success": true,
  "form_id": "1234567890123456"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Always `true` on success |
| `form_id` | string | Meta's unique ID for the created form — save this if needed |

**Response — 400 Bad Request (Validation Error)**
```json
{
  "success": false,
  "error": "Missing required fields: name and questions are required."
}
```

**Response — 500 Internal Server Error (Meta API Error)**
```json
{
  "success": false,
  "error": {
    "message": "...",
    "type": "OAuthException",
    "code": 200
  }
}
```

**Usage in React**
```js
const publishToMeta = async () => {
  const formJson = {
    name: formName,
    questions: selectedFields.map(field => ({
      type:  field.metaType,
      label: field.label,
      key:   field.key
    })),
    privacy_policy: { url: 'https://voxa-crm.vercel.app/privacy-policy' }
  };

  const res = await fetch(`${import.meta.env.VITE_META_API_URL}/api/forms/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(formJson)
  });

  const data = await res.json();

  if (data.success) {
    // Show success toast — form is live on Meta
    console.log('Form published, Meta Form ID:', data.form_id);
  } else {
    // Show error message to agent
    console.error('Publish failed:', data.error);
  }
};
```

---

### GET /api/leads

Returns the 100 most recent captured leads from the database, ordered newest first. Poll this every 30 seconds on the Lead Capture screen.

**Request**
```
GET https://voxa-crm-backend.vercel.app/api/leads
```

No request body or query parameters required.

**Response — 200 OK**
```json
{
  "success": true,
  "leads": [
    {
      "id": 1,
      "full_name": "Ahmed Raza",
      "email": "ahmed@example.com",
      "phone": "+971501234567",
      "form_id": "1234567890123456",
      "form_name": null,
      "lead_status": "new",
      "assigned_agent": null,
      "created_at": "2026-06-14T11:45:00.000Z"
    }
  ]
}
```

**Lead Object Fields**

| Field | Type | Description |
|---|---|---|
| `id` | integer | Auto-incremented primary key in the database |
| `full_name` | string | Lead's full name from the submitted form |
| `email` | string | Lead's email address |
| `phone` | string | Lead's phone number |
| `form_id` | string | Meta's form ID the lead came from |
| `form_name` | string \| null | Form name — populated if form was created via this system |
| `lead_status` | string | Default `"new"` — can be updated manually in the database |
| `assigned_agent` | string \| null | Agent assigned to this lead — `null` by default |
| `created_at` | string (ISO 8601) | Timestamp when the lead was stored |

**Response — 500 Internal Server Error**
```json
{
  "success": false,
  "error": "error message here"
}
```

**Usage in React — 30-second polling**
```js
useEffect(() => {
  const fetchLeads = async () => {
    try {
      const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/api/leads`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  fetchLeads(); // fetch immediately on mount
  const interval = setInterval(fetchLeads, 30000); // then every 30 seconds
  return () => clearInterval(interval); // cleanup on unmount
}, []);
```

---

### GET /webhook *(Internal — Meta only)*

Used by Meta to verify the webhook subscription. The frontend never calls this.

Meta sends: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`
Server responds with the challenge string if the token matches.

---

### POST /webhook *(Internal — Meta only)*

Meta posts lead events here automatically when a prospect submits a Lead Ads form. The frontend never calls this.

The server:
1. Responds `200 EVENT_RECEIVED` immediately (Meta requires < 5 seconds)
2. Fetches full lead data from Meta Graph API using the `leadgen_id`
3. Saves the lead to PostgreSQL

Mapped field keys from Meta:
- `full_name` or `name` → stored as `full_name`
- `email` → stored as `email`
- `phone_number` or `phone` → stored as `phone`

---

## Error Handling Summary

| HTTP Status | Meaning | When it happens |
|---|---|---|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Missing required fields in request body |
| 403 | Forbidden | Webhook token mismatch (internal only) |
| 500 | Server Error | Meta API rejected the call, or database error |

On any non-2xx or when `success: false`, always read `data.error` for the specific message.

---

## Environment Variable Required in React

```env
VITE_META_API_URL=https://voxa-crm-backend.vercel.app
```

Add this to the React project's environment variables on Vercel (Settings → Environment Variables).

---

## Quick Reference

| Method | Path | Called By | Purpose |
|---|---|---|---|
| `GET` | `/` | Frontend / monitoring | Health check |
| `POST` | `/api/forms/create` | Frontend | Publish Lead Ads form to Meta |
| `GET` | `/api/leads` | Frontend (polling) | Fetch captured leads |
| `GET` | `/webhook` | Meta only | Webhook token verification |
| `POST` | `/webhook` | Meta only | Receive new lead events |

---

*VOXA CRM — API Documentation — Internal use — VOXA Development Team*

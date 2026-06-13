# VOXA CRM — Meta Lead Ads Service API Documentation

This document describes the API endpoints provided by the Node.js backend for the Meta Lead Ads integration. The React frontend should use these endpoints to publish form configurations to Meta and to poll/retrieve captured leads.

## Base URLs

- **Local Development**: `http://localhost:3000`
- **Production (Vercel)**: `https://voxa-meta-service.vercel.app` (replace with your actual deployed Vercel domain)

---

## 1. Health Check

Verifies that the API service is active and running.

- **Endpoint**: `GET /`
- **Authentication**: None
- **Response Format**: `JSON`

### Success Response (`200 OK`)

```json
{
  "status": "healthy",
  "service": "VOXA Meta Integration API",
  "timestamp": "2026-06-12T12:31:35.244Z"
}
```

---

## 2. Get Leads

Retrieves the 100 most recent captured leads from the database, sorted by creation date (newest first).

- **Endpoint**: `GET /api/leads`
- **Authentication**: None (handled within the VPN/authorized portal)
- **Response Format**: `JSON`

### Success Response (`200 OK`)

```json
{
  "success": true,
  "leads": [
    {
      "id": 12,
      "full_name": "John Doe",
      "email": "johndoe@example.com",
      "phone": "+1234567890",
      "form_id": "1844573786356037",
      "form_name": "Spring Campaign Form",
      "lead_status": "new",
      "assigned_agent": null,
      "created_at": "2026-06-12T12:25:57.359Z"
    }
  ]
}
```

### Error Response (`500 Internal Server Error`)

```json
{
  "success": false,
  "error": "Error message details"
}
```

### Integration Hint (React Code)
Implement a 30-second polling interval in the Lead Capture component:
```javascript
useEffect(() => {
  const fetchLeads = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_META_API_URL}/api/leads`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    }
  };
  
  fetchLeads();
  const interval = setInterval(fetchLeads, 30000); // 30 seconds
  return () => clearInterval(interval);
}, []);
```

---

## 3. Create Leadgen Form

Publishes a form config to Meta Ads Manager under the configured ad account, and registers the form ID in the local database.

- **Endpoint**: `POST /api/forms/create`
- **Authentication**: None
- **Content-Type**: `application/json`
- **Request Body Parameters**:
  - `name` (String, Required): The descriptive name of the lead form (e.g. `"Spring Property Lead Form"`).
  - `questions` (Array, Required): List of fields. Each question must have:
    - `type` (String, Required): Meta standardized type (`"FULL_NAME"`, `"EMAIL"`, `"PHONE"`, etc.).
    - `label` (String, Required): The human-readable label to display on the form.
  - `privacy_policy` (Object, Optional): The privacy policy URL object. If not provided, defaults to `https://voxa-crm.vercel.app/privacy-policy`.
    - `url` (String): The privacy policy link (e.g., `https://yourdomain.com/privacy-policy`).

### Request Body Example

```json
{
  "name": "Property Inquiry Form",
  "questions": [
    {
      "type": "FULL_NAME",
      "label": "Full Name"
    },
    {
      "type": "EMAIL",
      "label": "Email Address"
    },
    {
      "type": "PHONE",
      "label": "Phone Number"
    }
  ],
  "privacy_policy": {
    "url": "https://voxa-crm.vercel.app/privacy-policy"
  }
}
```

### Success Response (`200 OK`)

```json
{
  "success": true,
  "form_id": "987654321098765"
}
```

### Error Response (`400 Bad Request`)

```json
{
  "success": false,
  "error": "Missing required fields: name and questions are required."
}
```

### Error Response (`500 Internal Server Error` - e.g. Meta API OAuth/Permission Failures)

```json
{
  "success": false,
  "error": {
    "message": "Unsupported post request. Object with ID '...' does not exist...",
    "type": "GraphMethodException",
    "code": 100,
    "error_subcode": 33,
    "fbtrace_id": "AwqklUMsskK"
  }
}
```

---

## 4. Webhook Verification & Events (Meta Internal Use)

These endpoints are called directly by the Meta Graph API to verify the webhook connection and dispatch new lead events.

### Webhook Verification
- **Endpoint**: `GET /webhook`
- **Query Params**:
  - `hub.mode` (should be `"subscribe"`)
  - `hub.verify_token` (matches your secret `META_WEBHOOK_VERIFY_TOKEN`)
  - `hub.challenge` (random string sent by Meta)
- **Response**: String containing `hub.challenge` value (`200 OK`) on success, or `403 Forbidden` on failure.

### Webhook Event Dispatcher
- **Endpoint**: `POST /webhook`
- **Response**: Returns text `EVENT_RECEIVED` with `200 OK` instantly to Meta (within 5 seconds), then processes the lead event asynchronously.

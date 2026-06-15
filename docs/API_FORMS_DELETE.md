# DELETE /api/forms/:id — API Documentation
**Base URL:** `https://voxa-crm-backend.vercel.app`
**Last Updated:** June 2026

---

## Overview

Archives a Lead Ads form on Meta and removes it from the VOXA database. Meta does not support permanent deletion of lead forms — archiving is the equivalent: the form is deactivated, stops accepting new submissions, and is hidden from active form lists.

---

## Endpoint

```
DELETE /api/forms/:id
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (URL param) | Yes | The Meta form ID to archive — from the `id` field returned by `GET /api/forms` |

No request body.

---

## What Happens Internally

```
1. Backend calls Meta Graph API:
   POST /v25.0/{form_id}  { status: "ARCHIVED" }

2. Meta sets the form status to ARCHIVED
   → Form stops accepting new lead submissions
   → Form no longer appears in active Meta Ads campaigns

3. Backend removes the form record from meta_forms table in PostgreSQL
   (only affects forms created via VOXA — forms created in Meta Ads Manager
    have no DB record to remove)

4. Returns success response
```

---

## Response — 200 Success

```json
{
  "success": true,
  "archived_form_id": "1557103402604191"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | `true` on success |
| `archived_form_id` | string | The form ID that was archived |

---

## Response — 400 Bad Request

```json
{
  "success": false,
  "error": "Form ID is required."
}
```

---

## Response — 500 Error

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

Occurs if the form ID doesn't exist on Meta, the Page Access Token is expired, or the token doesn't have permission over the form.

---

## React Implementation

```jsx
const archiveForm = async (formId) => {
  try {
    const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/api/forms/${formId}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      // Remove from local state so UI updates immediately
      setForms(prev => prev.filter(f => f.id !== formId));
    } else {
      console.error('Failed to archive form:', data.error);
    }
  } catch (err) {
    console.error('Network error:', err);
  }
};
```

**Wiring to a button:**
```jsx
<button onClick={() => archiveForm(form.id)}>
  Delete Form
</button>
```

---

## Important Notes

- **Archiving is permanent and irreversible via the API.** Once a form is archived on Meta it cannot be unarchived programmatically.
- **Leads already collected are NOT deleted.** Archiving a form does not remove any leads from Meta or from the VOXA database. Historical lead data is preserved.
- **`GET /api/forms` still returns archived forms** with `status: "ARCHIVED"`. Filter them out on the frontend with:
  ```js
  const activeForms = forms.filter(f => f.status === 'ACTIVE');
  ```
- Forms created directly in Meta Ads Manager (where `created_via_voxa: false`) can still be archived via this endpoint — they just won't have a DB record to clean up.

---

## Quick Reference — All Form Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/forms` | List all forms from Meta |
| `POST` | `/api/forms/create` | Create and publish a new form to Meta |
| `DELETE` | `/api/forms/:id` | Archive a form on Meta and remove from DB |

---

*VOXA CRM — Meta Integration API Documentation — VOXA Development Team — Confidential*

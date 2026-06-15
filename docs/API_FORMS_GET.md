# GET /api/forms — API Documentation
**Base URL:** `https://voxa-crm-backend.vercel.app`
**Last Updated:** June 2026

---

## Overview

Returns all Lead Ads forms associated with the VOXA Facebook Page, sourced directly from the Meta Graph API v25.0. Each form is flagged to indicate whether it was created through the VOXA backend or directly in Meta Ads Manager.

Use this endpoint to populate a form picker, dashboard list, or any UI that needs to display existing forms.

---

## Endpoint

```
GET /api/forms
```

No request body. No query parameters.

---

## Response — 200 Success

```json
{
  "success": true,
  "forms": [
    {
      "id": "1309644291325681",
      "name": "VOXA Property Leads",
      "status": "ACTIVE",
      "created_time": "2026-06-14T14:48:04+0000",
      "leads_count": 2,
      "created_via_voxa": true
    },
    {
      "id": "901672526353719",
      "name": "frontend test",
      "status": "ACTIVE",
      "created_time": "2026-06-14T13:00:00+0000",
      "leads_count": 0,
      "created_via_voxa": false
    }
  ]
}
```

### Form Object Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Meta's unique form ID |
| `name` | string | Form name as set in Meta |
| `status` | string | `"ACTIVE"` or `"ARCHIVED"` — only ACTIVE forms accept new leads |
| `created_time` | string | ISO 8601 UTC timestamp from Meta |
| `leads_count` | integer | Total leads collected on this form (from Meta) |
| `created_via_voxa` | boolean | `true` if this form was published using `POST /api/forms/create` — `false` if created directly in Meta Ads Manager |

---

## Response — 500 Error

```json
{
  "success": false,
  "error": "error message from Meta or database"
}
```

Occurs if the Meta Page Access Token is expired or the database is unreachable.

---

## React Implementation

```jsx
const [forms, setForms]     = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError]     = useState(null);

useEffect(() => {
  const fetchForms = async () => {
    try {
      const res  = await fetch(`${import.meta.env.VITE_META_API_URL}/api/forms`);
      const data = await res.json();
      if (data.success) {
        setForms(data.forms);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  fetchForms();
}, []);
```

**Rendering forms:**
```jsx
{forms.map(form => (
  <div key={form.id}>
    <p>{form.name}</p>
    <p>Status: {form.status}</p>
    <p>Leads: {form.leads_count}</p>
    <p>Created: {new Date(form.created_time).toLocaleDateString()}</p>
    {form.created_via_voxa && <span>Created via VOXA</span>}
  </div>
))}
```

**Filtering active forms only:**
```jsx
const activeForms = forms.filter(f => f.status === 'ACTIVE');
```

---

## Notes

- Returns up to **100 forms** sorted by Meta's default order (newest first)
- `leads_count` is fetched live from Meta — reflects the true count at request time
- Forms with `status: "ARCHIVED"` are returned but no longer accept new lead submissions
- `created_via_voxa: false` forms are still fully usable — leads from those forms will still be captured by the webhook and saved to the database as long as the form belongs to the subscribed page

---

*VOXA CRM — Meta Integration API Documentation — VOXA Development Team — Confidential*

# Voxa CRM — Campaigns API Documentation

> **Hey, before you start reading —**
>
> This backend already handles everything with Meta. You don't need to touch any Meta credentials, tokens, or Graph API calls.
> Every endpoint below is plug-and-play — just call it, get the data, render it.
>
> A few things to keep in mind:
> - **No auth header needed.** All Meta credentials live on the backend.
> - **Budgets are in cents.** PKR 100 = `10000`. Always divide by 100 before displaying to the user.
> - **Default status is always PAUSED.** Nothing spends money until you explicitly set `status: "ACTIVE"`.
> - **`success: true/false`** is on every response. Always check it before reading data. On failure, show the `error` string in a toast.
> - **`GET /api/campaigns`** gives you the list. **`GET /api/campaigns/:id`** gives you everything — ad sets, ads, creative, performance, breakdowns, charts. Use list for the table view, detail for the campaign page.

---

Base URL: `https://voxa-crm-backend.vercel.app`

All responses: `Content-Type: application/json`

---

## Full Ad Creation Flow (in order)

```
1. POST /api/campaigns/create          → get campaign_id
2. POST /api/adsets/create             → get adset_id        (needs campaign_id)
3. POST /api/adcreatives/upload-image  → get image_hash
4. POST /api/adcreatives/create        → get creative_id     (needs image_hash + form_id)
5. POST /api/ads/create                → ad is live          (needs adset_id + creative_id)
```

---

## CAMPAIGNS

### GET /api/campaigns
Returns all campaigns across **all ad accounts** linked to this account — not just one.
Use this for the campaigns list/table view.

**Request**
```
GET /api/campaigns
```

**Response — 200**
```json
{
  "success": true,
  "campaigns": [
    {
      "id": "120249381600010074",
      "name": "Askari Height Launch",
      "objective": "OUTCOME_LEADS",
      "status": "PAUSED",
      "effective_status": "PAUSED",
      "configured_status": "PAUSED",
      "daily_budget": "250000",
      "lifetime_budget": null,
      "budget_remaining": "250000",
      "spend_cap": null,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
      "buying_type": "AUCTION",
      "pacing_type": ["standard"],
      "start_time": "2026-09-14T01:14:42+0500",
      "stop_time": null,
      "created_time": "2026-09-14T01:14:40+0500",
      "updated_time": "2026-09-14T01:14:40+0500",
      "special_ad_categories": [],
      "promoted_object": null,
      "issues_info": null,
      "source_campaign_id": "0",
      "ad_account_id": "act_1844573786356037",
      "ad_account_name": "THE PASSION BASE PAKISTAN",
      "page_id": "241112186077505",
      "page_name": "Voxa Official Page"
    }
  ],
  "accounts": [
    {
      "ad_account_id": "act_1844573786356037",
      "ad_account_name": "THE PASSION BASE PAKISTAN",
      "campaigns": [ "..." ]
    }
  ]
}
```

**Field reference**

| Field | Description |
|---|---|
| `id` | Campaign ID — use this for all detail/update/delete calls |
| `status` | Configured status: `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED` |
| `effective_status` | Actual delivery status — may differ (e.g. `CAMPAIGN_PAUSED`, `WITH_ISSUES`) |
| `daily_budget` | Daily spend limit in cents — divide by 100 for display |
| `budget_remaining` | How much budget is left today in cents |
| `ad_account_id` | Which ad account this campaign belongs to |
| `ad_account_name` | Human-readable ad account name |
| `page_id` | Facebook Page ID this campaign is linked to (if available) |
| `page_name` | Facebook Page name — ready to display |

---

### GET /api/campaigns/:id
Returns **everything** about a campaign — configuration, ad sets, ads, creatives, performance metrics, breakdowns by age/gender/placement/device/country, and daily chart data.

Use this for the individual campaign detail page.

**Request**
```
GET /api/campaigns/120249381600010074
GET /api/campaigns/120249381600010074?date_preset=last_7d
```

**Query Params**

| Param | Default | Options |
|---|---|---|
| `date_preset` | `last_30d` | `today`, `yesterday`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month`, `this_quarter`, `last_year`, `maximum` (all time) |

**Response — 200**
```json
{
  "success": true,
  "date_preset": "last_30d",
  "campaign": {

    "id": "120249381600010074",
    "name": "Askari Height Launch",
    "objective": "OUTCOME_LEADS",
    "status": "PAUSED",
    "effective_status": "PAUSED",
    "configured_status": "PAUSED",
    "daily_budget": "250000",
    "lifetime_budget": null,
    "budget_remaining": "250000",
    "spend_cap": null,
    "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
    "buying_type": "AUCTION",
    "pacing_type": ["standard"],
    "start_time": "2026-09-14T01:14:42+0500",
    "stop_time": null,
    "created_time": "2026-09-14T01:14:40+0500",
    "updated_time": "2026-09-14T01:14:40+0500",
    "special_ad_categories": [],
    "issues_info": null,

    "insights": {
      "spend": "507.15",
      "reach": "68627",
      "impressions": "147047",
      "clicks": "2324",
      "unique_clicks": "1501",
      "ctr": "1.580447",
      "unique_ctr": "2.187186",
      "cpm": "3.448897",
      "cpc": "0.218223",
      "cpp": "7.389949",
      "frequency": "2.142699",
      "actions": {
        "lead": "18",
        "link_click": "1613",
        "purchase": "54",
        "add_to_cart": "316",
        "initiate_checkout": "129",
        "landing_page_view": "1413",
        "post_engagement": "1795"
      },
      "cost_per_action_type": {
        "lead": "28.17",
        "purchase": "9.39",
        "link_click": "0.31"
      },
      "action_values": {
        "purchase": "786.46"
      },
      "date_start": "2026-08-15",
      "date_stop": "2026-09-14"
    },

    "insights_by_age": [
      { "age": "18-24", "spend": "31.73", "impressions": "16641", "clicks": "213", "ctr": "1.27", "cpm": "1.90", "cpc": "0.14", "actions": { "purchase": "2" } },
      { "age": "25-34", "spend": "180.00", "impressions": "52000", "clicks": "890", "ctr": "1.71", "cpm": "3.46", "cpc": "0.20", "actions": { "purchase": "24" } },
      { "age": "35-44", "spend": "155.00", "impressions": "40000", "clicks": "700", "ctr": "1.75", "cpm": "3.87", "cpc": "0.22", "actions": { "purchase": "18" } }
    ],

    "insights_by_gender": [
      { "gender": "male",    "spend": "469.19", "impressions": "139763", "clicks": "2173" },
      { "gender": "female",  "spend": "35.63",  "impressions": "6682",   "clicks": "144" },
      { "gender": "unknown", "spend": "2.33",   "impressions": "602",    "clicks": "7" }
    ],

    "insights_by_placement": [
      { "publisher_platform": "facebook",  "platform_position": "feed",             "spend": "201.41", "impressions": "66668", "clicks": "1135" },
      { "publisher_platform": "instagram", "platform_position": "feed",             "spend": "166.51", "impressions": "33245", "clicks": "491" },
      { "publisher_platform": "instagram", "platform_position": "instagram_reels",  "spend": "40.01",  "impressions": "12874", "clicks": "174" },
      { "publisher_platform": "instagram", "platform_position": "instagram_stories", "spend": "52.94", "impressions": "8025",  "clicks": "271" },
      { "publisher_platform": "facebook",  "platform_position": "facebook_reels",   "spend": "3.70",   "impressions": "3464",  "clicks": "22" }
    ],

    "insights_by_country": [
      { "country": "PK", "spend": "507.15", "impressions": "147047", "clicks": "2324" }
    ],

    "insights_by_device": [
      { "impression_device": "iphone",           "spend": "306.43", "impressions": "76922", "clicks": "1324" },
      { "impression_device": "android_smartphone","spend": "188.63", "impressions": "65472", "clicks": "969" },
      { "impression_device": "desktop",           "spend": "10.04",  "impressions": "4064",  "clicks": "28" },
      { "impression_device": "ipad",              "spend": "1.64",   "impressions": "444",   "clicks": "3" }
    ],

    "insights_daily": [
      { "date_start": "2026-08-15", "date_stop": "2026-08-15", "spend": "2.09", "reach": "658", "impressions": "671", "clicks": "6" },
      { "date_start": "2026-08-16", "date_stop": "2026-08-16", "spend": "9.72", "reach": "1982", "impressions": "2425", "clicks": "40" },
      { "date_start": "2026-08-17", "date_stop": "2026-08-17", "spend": "10.05", "reach": "2678", "impressions": "3354", "clicks": "56" }
    ],

    "adsets": [
      {
        "id": "120249381600520074",
        "name": "karachi 25",
        "campaign_id": "120249381600010074",
        "status": "PAUSED",
        "effective_status": "PAUSED",
        "configured_status": "PAUSED",
        "daily_budget": "50000",
        "budget_remaining": "0",
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "optimization_goal": "LEAD_GENERATION",
        "billing_event": "IMPRESSIONS",
        "destination_type": "ON_AD",
        "promoted_object": { "page_id": "241112186077505" },
        "targeting": {
          "age_min": 25,
          "age_max": 55,
          "genders": [1, 2],
          "geo_locations": {
            "countries": ["PK"],
            "location_types": ["home", "recent"]
          }
        },
        "is_dynamic_creative": false,
        "learning_stage_info": { "attribution_windows": ["1d_click"] },
        "start_time": "2026-09-14T01:14:42+0500",
        "created_time": "2026-09-14T01:14:42+0500",
        "updated_time": "2026-09-14T01:15:02+0500",
        "insights": {
          "spend": "507.15",
          "reach": "68627",
          "impressions": "147047",
          "clicks": "2324",
          "ctr": "1.58",
          "cpm": "3.44",
          "cpc": "0.21",
          "actions": { "lead": "18", "link_click": "1613" },
          "date_start": "2026-08-15",
          "date_stop": "2026-09-14"
        },
        "ads": [
          {
            "id": "120249381601640074",
            "name": "ad 2",
            "adset_id": "120249381600520074",
            "campaign_id": "120249381600010074",
            "status": "PAUSED",
            "effective_status": "PAUSED",
            "configured_status": "PAUSED",
            "bid_type": "ABSOLUTE_OCPM",
            "preview_shareable_link": "https://fb.me/26viwv4g2vBuKmL",
            "created_time": "2026-09-14T01:14:48+0500",
            "updated_time": "2026-09-14T04:28:38+0500",
            "creative": {
              "id": "27637536022587113",
              "name": "Askari Height Launch - Creative",
              "title": "Summer Sale",
              "body": "get 25% off",
              "image_url": "https://scontent.fbcdn.net/...",
              "thumbnail_url": "https://scontent.fbcdn.net/...",
              "call_to_action_type": "LEARN_MORE",
              "object_story_spec": {
                "page_id": "241112186077505",
                "link_data": {
                  "link": "https://voxa-crm.vercel.app/",
                  "message": "get 25% off",
                  "name": "Summer Sale",
                  "call_to_action": { "type": "LEARN_MORE" }
                }
              }
            },
            "tracking_specs": [ "..." ],
            "conversion_specs": [ "..." ],
            "insights": {
              "spend": "507.15",
              "reach": "68627",
              "impressions": "147047",
              "clicks": "2324",
              "ctr": "1.58",
              "actions": { "lead": "18" },
              "date_start": "2026-08-15",
              "date_stop": "2026-09-14"
            }
          }
        ]
      }
    ]
  }
}
```

> **Note:** `insights`, `insights_by_age`, `insights_by_gender`, etc. will be `null` or empty `[]` if the campaign has never run or had no spend in the selected date range. Always null-check before rendering charts or stats.

---

### POST /api/campaigns/create
Creates a new campaign.

**Request**
```
POST /api/campaigns/create
Content-Type: application/json
```

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Campaign name |
| `objective` | string | Yes | See objectives table |
| `status` | string | No | `ACTIVE` or `PAUSED` — default: `PAUSED` |
| `special_ad_categories` | array | No | `[]` for none. Options: `CREDIT`, `EMPLOYMENT`, `HOUSING` |
| `daily_budget` | number | No | Daily budget in cents. PKR 100 = `10000` |
| `lifetime_budget` | number | No | Total budget in cents. Use one of daily or lifetime, not both |
| `bid_strategy` | string | No | Default: `LOWEST_COST_WITHOUT_CAP` |
| `start_time` | string | No | ISO date string |
| `stop_time` | string | No | ISO date string |

**Objectives**

| Value | Use Case |
|---|---|
| `OUTCOME_LEADS` | Lead generation forms |
| `OUTCOME_TRAFFIC` | Drive traffic to website |
| `OUTCOME_AWARENESS` | Brand awareness / reach |
| `OUTCOME_ENGAGEMENT` | Post likes, comments, shares |
| `OUTCOME_SALES` | Purchases / conversions |

**Bid Strategies**

| Value | Description |
|---|---|
| `LOWEST_COST_WITHOUT_CAP` | Meta auto-optimises — recommended default |
| `LOWEST_COST_WITH_BID_CAP` | You set a max bid — ad set must also include `bid_amount` |
| `COST_CAP` | Target average cost per result |

**Example**
```json
{
  "name": "Askari Heights Launch",
  "objective": "OUTCOME_LEADS",
  "status": "PAUSED",
  "special_ad_categories": [],
  "daily_budget": 50000
}
```

**Response — 200**
```json
{
  "success": true,
  "campaign_id": "120249381600010074"
}
```

---

### PATCH /api/campaigns/:id
Update a campaign. Send only the fields you want to change.

```
PATCH /api/campaigns/120249381600010074
Content-Type: application/json
```

```json
{ "status": "ACTIVE" }
```

```json
{ "success": true, "updated_campaign_id": "120249381600010074" }
```

---

### DELETE /api/campaigns/:id
Permanently deletes a campaign and all its ad sets and ads.

```
DELETE /api/campaigns/120249381600010074
```

```json
{ "success": true, "deleted_campaign_id": "120249381600010074" }
```

---

## AD SETS

### GET /api/adsets
Returns all ad sets. Filter by campaign using `?campaign_id=`.

```
GET /api/adsets
GET /api/adsets?campaign_id=120249381600010074
```

```json
{
  "success": true,
  "adsets": [
    {
      "id": "120249381600520074",
      "name": "karachi 25",
      "campaign_id": "120249381600010074",
      "status": "PAUSED",
      "effective_status": "PAUSED",
      "daily_budget": "50000",
      "optimization_goal": "LEAD_GENERATION",
      "billing_event": "IMPRESSIONS",
      "targeting": { "age_min": 25, "age_max": 55, "genders": [1, 2], "geo_locations": { "countries": ["PK"] } },
      "created_time": "2026-09-14T01:14:42+0500"
    }
  ]
}
```

---

### POST /api/adsets/create

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Ad set name |
| `campaign_id` | string | Yes | ID from campaign create |
| `daily_budget` | number | No* | In cents. Skip if campaign already has a budget |
| `lifetime_budget` | number | No* | In cents |
| `status` | string | No | Default: `PAUSED` |
| `targeting` | object | No | Audience object — see below |
| `bid_amount` | number | No | Only required if campaign uses `LOWEST_COST_WITH_BID_CAP` |
| `start_time` | string | No | ISO date string |
| `end_time` | string | No | ISO date string |

> **Do not send `daily_budget` on the ad set if the campaign already has a `daily_budget`.** The backend detects this automatically.

**Targeting Object**
```json
{
  "age_min": 25,
  "age_max": 55,
  "genders": [1, 2],
  "geo_locations": {
    "countries": ["PK"],
    "cities": [
      { "key": "269748", "name": "Lahore" },
      { "key": "269749", "name": "Karachi" }
    ]
  },
  "interests": [
    { "id": "6003020834693", "name": "Real estate" }
  ],
  "publisher_platforms": ["facebook", "instagram"]
}
```

| Genders value | Meaning |
|---|---|
| `[1, 2]` | All |
| `[1]` | Male only |
| `[2]` | Female only |

**Example**
```json
{
  "name": "Karachi 25-55",
  "campaign_id": "120249381600010074",
  "daily_budget": 5000,
  "targeting": {
    "age_min": 25,
    "age_max": 55,
    "genders": [1, 2],
    "geo_locations": { "countries": ["PK"] }
  }
}
```

**Response — 200**
```json
{ "success": true, "adset_id": "120249381600520074" }
```

---

### PATCH /api/adsets/:id

```json
{ "status": "ACTIVE" }
```

```json
{ "success": true, "updated_adset_id": "120249381600520074" }
```

---

### DELETE /api/adsets/:id

```json
{ "success": true, "deleted_adset_id": "120249381600520074" }
```

---

## AD CREATIVES

### POST /api/adcreatives/upload-image
Upload an image to Meta. Returns `image_hash` needed for creative creation.

```
POST /api/adcreatives/upload-image
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | Yes | JPG or PNG. Max 30MB. Recommended: 1080×1080px |

**React example**
```javascript
const formData = new FormData();
formData.append('image', imageFile);

const res = await fetch(`${BASE_URL}/api/adcreatives/upload-image`, {
  method: 'POST',
  body: formData,
});
const { image_hash } = await res.json();
```

**Response — 200**
```json
{ "success": true, "image_hash": "f295a05219ff6beb331d1acc8f501e26" }
```

> `image_hash` is reusable — the same hash can be used across multiple creatives without re-uploading.

---

### POST /api/adcreatives/create

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Creative name (internal label only) |
| `image_hash` | string | Yes | From upload-image |
| `message` | string | Yes | Main ad body text |
| `headline` | string | Yes | Bold text below image |
| `description` | string | No | Smaller text below headline |
| `lead_gen_form_id` | string | Yes | From `GET /api/forms` |
| `cta_type` | string | No | CTA button — default: `SIGN_UP` |
| `link_url` | string | No | Destination URL |

**CTA Options**

| Value | Button label |
|---|---|
| `SIGN_UP` | Sign Up |
| `LEARN_MORE` | Learn More |
| `APPLY_NOW` | Apply Now |
| `GET_QUOTE` | Get Quote |
| `CONTACT_US` | Contact Us |
| `SUBSCRIBE` | Subscribe |

**Example**
```json
{
  "name": "Askari Heights Creative",
  "image_hash": "f295a05219ff6beb331d1acc8f501e26",
  "message": "Luxury apartments in Lahore. Limited units available.",
  "headline": "Askari Heights — Book Now",
  "description": "3 & 4 bedroom apartments starting PKR 1.2 Crore",
  "lead_gen_form_id": "1944770553599722",
  "cta_type": "LEARN_MORE"
}
```

**Response — 200**
```json
{ "success": true, "creative_id": "27637536022587113" }
```

---

### GET /api/adcreatives

```json
{
  "success": true,
  "creatives": [
    { "id": "27637536022587113", "name": "Askari Heights Creative", "created_time": "2026-09-14T10:10:00+0500" }
  ]
}
```

---

### DELETE /api/adcreatives/:id

```json
{ "success": true, "deleted_creative_id": "27637536022587113" }
```

---

## ADS

### GET /api/ads
Returns all ads. Filter by ad set using `?adset_id=`.

```
GET /api/ads
GET /api/ads?adset_id=120249381600520074
```

```json
{
  "success": true,
  "ads": [
    {
      "id": "120249381601640074",
      "name": "ad 2",
      "adset_id": "120249381600520074",
      "campaign_id": "120249381600010074",
      "status": "PAUSED",
      "effective_status": "PAUSED",
      "creative": { "id": "27637536022587113" },
      "created_time": "2026-09-14T01:14:48+0500"
    }
  ]
}
```

---

### POST /api/ads/create

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Ad name |
| `adset_id` | string | Yes | ID from adset create |
| `creative_id` | string | Yes | ID from creative create |
| `status` | string | No | Default: `PAUSED` |

**Example**
```json
{
  "name": "Askari Heights Ad 1",
  "adset_id": "120249381600520074",
  "creative_id": "27637536022587113",
  "status": "PAUSED"
}
```

**Response — 200**
```json
{ "success": true, "ad_id": "120249381601640074" }
```

---

### PATCH /api/ads/:id

```json
{ "status": "ACTIVE" }
```

```json
{ "success": true, "updated_ad_id": "120249381601640074" }
```

---

### DELETE /api/ads/:id

```json
{ "success": true, "deleted_ad_id": "120249381601640074" }
```

---

## Budget — PKR Conversion

Meta stores budgets in the **smallest currency unit (cents)**.

| Display | Send to API |
|---|---|
| PKR 50 | `5000` |
| PKR 100 | `10000` |
| PKR 500 | `50000` |
| PKR 1,000 | `100000` |
| PKR 2,500 | `250000` |

Always divide by 100 before showing to the user.

---

## Insights Field Reference

All `insights` objects (campaign, adset, ad) share these fields:

| Field | Description |
|---|---|
| `spend` | Total amount spent (in account currency) |
| `reach` | Unique people who saw the ad |
| `impressions` | Total times the ad was shown |
| `clicks` | Total clicks |
| `unique_clicks` | Unique people who clicked |
| `ctr` | Click-through rate (%) |
| `unique_ctr` | Unique CTR (%) |
| `cpm` | Cost per 1000 impressions |
| `cpc` | Cost per click |
| `cpp` | Cost per person reached |
| `frequency` | Avg times each person saw the ad |
| `actions` | Map of result types → count (leads, purchases, link_clicks, etc.) |
| `cost_per_action_type` | Map of result types → cost per result |
| `action_values` | Map of result types → revenue value |
| `date_start` / `date_stop` | Date range the insights cover |

**Breakdown-specific fields**

| Breakdown | Extra field on each row |
|---|---|
| `insights_by_age` | `age` — e.g. `"18-24"`, `"25-34"`, `"35-44"`, `"45-54"`, `"55-64"`, `"65+"` |
| `insights_by_gender` | `gender` — `"male"`, `"female"`, `"unknown"` |
| `insights_by_placement` | `publisher_platform` + `platform_position` |
| `insights_by_country` | `country` — ISO code e.g. `"PK"` |
| `insights_by_device` | `impression_device` — `"iphone"`, `"android_smartphone"`, `"desktop"`, `"ipad"` |
| `insights_daily` | `date_start` = `date_stop` = one day — use for line/bar charts |

**Common `actions` keys**

| Key | What it means |
|---|---|
| `lead` | Lead form submissions |
| `link_click` | Link clicks |
| `landing_page_view` | Landing page views |
| `purchase` | Purchases |
| `add_to_cart` | Add to cart |
| `initiate_checkout` | Checkout started |
| `post_engagement` | Likes, comments, shares, reactions |
| `post_reaction` | Reactions only |
| `video_view` | Video views |

---

## Error Format

Every error response follows this shape:

```json
{
  "success": false,
  "error": "name and objective are required."
}
```

Always check `success` first. Display the `error` string in a toast notification or inline error message. Never show raw Meta error objects to the user.

---

## Important Notes

1. **Status is always PAUSED by default.** Nothing runs or spends money until `status: "ACTIVE"` is explicitly set.
2. **Image hash is reusable.** Upload once, use across multiple creatives.
3. **Campaign budget vs ad set budget.** If a campaign has `daily_budget` set (CBO), do NOT send `daily_budget` on the ad set — the backend handles this automatically.
4. **If any step in the creation flow fails,** start fresh from Step 1. Do not try to reuse IDs from a partially failed flow.
5. **`null` insights means no spend.** A paused or brand-new campaign will return `null` for all insight fields. Always null-check before rendering charts or stat cards.
6. **CORS** is fully open — all methods (GET, POST, PATCH, DELETE, OPTIONS) are allowed.

---

*Voxa CRM — Campaigns API — Confidential — Do not share externally*

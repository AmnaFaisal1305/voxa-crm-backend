const axios = require('axios');

const BASE = 'https://graph.facebook.com/v25.0';

const getToken = () => process.env.META_USER_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;

// In-memory cache — prevents hammering Meta when the frontend re-renders or polls
const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const RATE_LIMIT_RESPONSE = {
  success: false,
  error: 'rate_limit',
  message: 'Meta API rate limit reached. Please wait a moment and try again.',
};

function isRateLimit(err) {
  return err?.response?.data?.error?.code === 17;
}

// Per-ad-account rate limit cooldown.
// Two triggers:
//   1. Reactive  — Meta returns error code 17 → 5-min cooldown
//   2. Proactive — x-fb-ads-insights-throttle header shows ≥80% utilisation → shorter cooldown
const _rateLimitedAccounts = new Map(); // accountId → expiresAt

function isAccountCoolingDown(accountId) {
  if (!accountId) return false;
  const exp = _rateLimitedAccounts.get(accountId);
  if (!exp) return false;
  if (Date.now() > exp) { _rateLimitedAccounts.delete(accountId); return false; }
  return true;
}

function markAccountRateLimited(accountId, cooldownMs = 5 * 60_000) {
  if (accountId) _rateLimitedAccounts.set(accountId, Date.now() + cooldownMs);
}

// Read Meta's official throttle header from an axios response.
// x-fb-ads-insights-throttle: {"app_id_util_pct":7,"acc_id_util_pct":47,"ads_api_access_tier":"standard_access"}
// acc_id_util_pct tells us how close this specific ad account is to its limit.
function checkThrottleHeader(axiosResponse, accountId) {
  if (!axiosResponse || !accountId) return;
  try {
    const raw = axiosResponse.headers?.['x-fb-ads-insights-throttle'];
    if (!raw) return;
    const { acc_id_util_pct: pct } = JSON.parse(raw);
    if (pct >= 95) {
      // Almost at the wall — 5-min cooldown before we get error code 17
      markAccountRateLimited(accountId, 5 * 60_000);
      console.log(`[throttle] ${accountId} at ${pct}% — 5-min cooldown`);
    } else if (pct >= 80) {
      // High but not critical — 90-second breather
      markAccountRateLimited(accountId, 90_000);
      console.log(`[throttle] ${accountId} at ${pct}% — 90s cooldown`);
    }
  } catch { /* ignore malformed header */ }
}

// Look up a campaign's ad_account_id from any cached list response
function getAccountIdFromCache(campaignId) {
  for (const [key, entry] of _cache.entries()) {
    if (!key.startsWith('list:') || Date.now() > entry.expiresAt) continue;
    const c = entry.data?.campaigns?.find((x) => x.id === campaignId);
    if (c?.ad_account_id) return c.ad_account_id;
  }
  return null;
}

// Run Promise.all in chunks to avoid spiking Meta's rate limit
async function batchedAllSettled(items, batchSize = 3, delayMs = 300) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch);
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// Single retry after a fixed delay on rate limit. Fast-fail — no exponential waits.
async function withRateLimitRetry(fn, maxRetries = 1, retryDelayMs = 3000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimit(err) || attempt === maxRetries) throw err;
      console.log(`Meta rate limit — retrying in ${retryDelayMs}ms`);
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
}

exports.getCampaigns = async (req, res) => {
  try {
    const token = getToken();

    const VALID_PRESETS = new Set([
      'today','yesterday','this_month','last_month','this_quarter',
      'maximum','data_maximum',
      'last_3d','last_7d','last_14d','last_28d','last_30d','last_90d',
      'last_week_mon_sun','last_week_sun_sat','last_quarter','last_year',
      'this_week_mon_today','this_week_sun_today','this_year',
    ]);
    const rawPreset = req.query.date_preset || 'last_30d';
    const datePreset = rawPreset === 'lifetime' ? 'maximum' : (VALID_PRESETS.has(rawPreset) ? rawPreset : 'last_30d');

    const cacheKey = `list:${datePreset}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const CAMPAIGN_FIELDS = [
      'id', 'name', 'objective', 'status', 'effective_status', 'configured_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap',
      'bid_strategy', 'buying_type', 'pacing_type',
      'start_time', 'stop_time', 'created_time', 'updated_time',
      'special_ad_categories', 'special_ad_category_country',
      'promoted_object', 'issues_info', 'adlabels', 'source_campaign_id',
      'adsets{promoted_object}',
    ].join(',');

    const LIST_INSIGHT_FIELDS = [
      'spend', 'reach', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc', 'cpp', 'frequency',
      'actions', 'cost_per_action_type', 'action_values',
      'date_start', 'date_stop',
    ].join(',');

    // Fetch all ad accounts and managed pages in parallel
    const [accountsResp, pagesResp] = await Promise.all([
      axios.get(`${BASE}/me/adaccounts`, {
        params: { access_token: token, fields: 'id,name', limit: 100 },
      }),
      axios.get(`${BASE}/me/accounts`, {
        params: { access_token: token, fields: 'id,name', limit: 100 },
      }),
    ]);

    const adAccounts = accountsResp.data.data || [];

    // Build page_id → page_name lookup
    const pageMap = {};
    for (const page of (pagesResp.data.data || [])) {
      pageMap[page.id] = page.name;
    }

    // Fetch campaigns from all ad accounts in parallel
    const results = await Promise.allSettled(
      adAccounts.map(async (account) => {
        const { data } = await axios.get(`${BASE}/${account.id}/campaigns`, {
          params: { access_token: token, fields: CAMPAIGN_FIELDS, limit: 100 },
        });
        return {
          ad_account_id: account.id,
          ad_account_name: account.name,
          campaigns: data.data || [],
        };
      })
    );

    const accounts = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    // Flatten campaigns and resolve page info
    const allCampaigns = accounts.flatMap((a) =>
      a.campaigns.map((c) => {
        const campaignPageId = c.promoted_object?.page_id || null;
        const adsetPageId = (c.adsets?.data || [])
          .map((as) => as.promoted_object?.page_id)
          .find(Boolean) || null;
        const pageId = campaignPageId || adsetPageId;
        const { adsets: _adsets, ...campaignData } = c;
        return {
          ...campaignData,
          ad_account_id: a.ad_account_id,
          ad_account_name: a.ad_account_name,
          page_id: pageId,
          page_name: pageId ? (pageMap[pageId] || null) : null,
        };
      })
    );

    // Fetch insights in batches of 3 — skip campaigns whose account is already cooling down
    const insightResults = await batchedAllSettled(
      allCampaigns.map((c) => {
        if (isAccountCoolingDown(c.ad_account_id)) {
          return Promise.reject(new Error('account_cooldown'));
        }
        return axios.get(`${BASE}/${c.id}/insights`, {
          params: { access_token: token, fields: LIST_INSIGHT_FIELDS, date_preset: datePreset },
        });
      }),
      3,   // 3 at a time
      300  // 300ms between batches
    );

    // Check throttle headers + mark rate-limited accounts from the insight batch
    allCampaigns.forEach((c, i) => {
      const r = insightResults[i];
      if (r.status === 'fulfilled') {
        checkThrottleHeader(r.value, c.ad_account_id);
      } else if (r.status === 'rejected' && isRateLimit(r.reason)) {
        markAccountRateLimited(c.ad_account_id);
      }
    });

    // Attach insights to each campaign
    const toMap = (arr) => {
      if (!Array.isArray(arr)) return {};
      return arr.reduce((acc, item) => { acc[item.action_type] = item.value; return acc; }, {});
    };

    const campaignsWithInsights = allCampaigns.map((c, i) => {
      const raw = insightResults[i].status === 'fulfilled'
        ? insightResults[i].value?.data?.data?.[0] || null
        : null;

      if (!raw) return { ...c, insights: null };

      return {
        ...c,
        insights: {
          ...raw,
          actions:              toMap(raw.actions),
          cost_per_action_type: toMap(raw.cost_per_action_type),
          action_values:        toMap(raw.action_values),
        },
      };
    });

    const responseData = { success: true, date_preset: datePreset, campaigns: campaignsWithInsights, accounts };
    cacheSet(cacheKey, responseData, 2 * 60_000); // 2-minute cache on the list
    res.json(responseData);
  } catch (err) {
    console.error('Error fetching campaigns:', err.response?.data || err.message);
    if (err.response?.data?.error?.code === 17) return res.json(RATE_LIMIT_RESPONSE);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const {
      name,
      objective,
      status = 'PAUSED',
      special_ad_categories = [],
      daily_budget,
      lifetime_budget,
      bid_strategy,
      start_time,
      stop_time,
    } = req.body;

    if (!name || !objective) {
      return res.status(400).json({
        success: false,
        error: 'name and objective are required.',
      });
    }

    const payload = {
      name,
      objective,
      status,
      special_ad_categories: JSON.stringify(special_ad_categories),
      access_token: getToken(),
    };

    if (daily_budget)    payload.daily_budget    = daily_budget;
    if (lifetime_budget) payload.lifetime_budget = lifetime_budget;
    if (bid_strategy)    payload.bid_strategy    = bid_strategy;
    if (start_time)      payload.start_time      = start_time;
    if (stop_time)       payload.stop_time       = stop_time;

    // Required by some ad accounts when no campaign-level budget is set
    if (!daily_budget && !lifetime_budget) {
      payload.is_adset_budget_sharing_enabled = false;
    }

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/campaigns`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Campaign "${name}" created with ID: ${data.id}`);
    res.json({ success: true, campaign_id: data.id });
  } catch (err) {
    console.error('Campaign creation error:', err.response?.data || err.message);
    const metaErr = err.response?.data?.error;
    res.status(500).json({
      success: false,
      error: metaErr?.error_user_msg || metaErr?.message || err.message,
      detail: metaErr || null,
    });
  }
};

const INSIGHT_FIELDS = [
  'spend', 'reach', 'impressions', 'clicks', 'unique_clicks',
  'ctr', 'unique_ctr', 'cpm', 'cpc', 'cpp', 'frequency',
  'actions', 'cost_per_action_type', 'action_values',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
  'video_play_actions',
  'date_start', 'date_stop',
].join(',');

// Normalize Meta's actions array into a flat key→value object
function normalizeActions(insightData) {
  if (!insightData) return null;
  const row = Array.isArray(insightData) ? insightData[0] : insightData;
  if (!row) return null;

  const result = { ...row };

  const toMap = (arr) => {
    if (!Array.isArray(arr)) return {};
    return arr.reduce((acc, item) => {
      acc[item.action_type] = item.value;
      return acc;
    }, {});
  };

  if (row.actions)                      result.actions                  = toMap(row.actions);
  if (row.cost_per_action_type)         result.cost_per_action_type     = toMap(row.cost_per_action_type);
  if (row.action_values)                result.action_values            = toMap(row.action_values);
  if (row.video_p25_watched_actions)    result.video_p25_watched_actions  = toMap(row.video_p25_watched_actions);
  if (row.video_p50_watched_actions)    result.video_p50_watched_actions  = toMap(row.video_p50_watched_actions);
  if (row.video_p75_watched_actions)    result.video_p75_watched_actions  = toMap(row.video_p75_watched_actions);
  if (row.video_p100_watched_actions)   result.video_p100_watched_actions = toMap(row.video_p100_watched_actions);
  if (row.video_play_actions)           result.video_play_actions         = toMap(row.video_play_actions);

  return result;
}

exports.getCampaignDetails = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Campaign ID is required.' });

  const VALID_PRESETS = new Set([
    'today','yesterday','this_month','last_month','this_quarter',
    'maximum','data_maximum',
    'last_3d','last_7d','last_14d','last_28d','last_30d','last_90d',
    'last_week_mon_sun','last_week_sun_sat','last_quarter','last_year',
    'this_week_mon_today','this_week_sun_today','this_year',
  ]);
  const rawPreset = req.query.date_preset || 'last_30d';
  const datePreset = rawPreset === 'lifetime' ? 'maximum' : (VALID_PRESETS.has(rawPreset) ? rawPreset : 'last_30d');
  const includeBreakdowns = req.query.include_breakdowns === 'true';

  const cacheKey = `detail:${id}:${datePreset}:${includeBreakdowns}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const token = getToken();
  const insightParams = { access_token: token, fields: INSIGHT_FIELDS, date_preset: datePreset };

  const BREAKDOWN_FIELDS = 'spend,reach,impressions,clicks,ctr,cpm,cpc,actions,cost_per_action_type,action_values,date_start,date_stop';

  const AD_FIELDS = [
    'id', 'name', 'adset_id', 'campaign_id',
    'status', 'effective_status', 'configured_status',
    'creative{id,name,title,body,image_url,thumbnail_url,object_story_spec,call_to_action_type,link_url}',
    'bid_amount', 'bid_type', 'bid_info',
    'tracking_specs', 'conversion_specs',
    'review_feedback', 'issues_info',
    'preview_shareable_link',
    'created_time', 'updated_time',
  ].join(',');

  const ADSET_FIELDS = [
    'id', 'name', 'campaign_id', 'status', 'effective_status', 'configured_status',
    'daily_budget', 'lifetime_budget', 'budget_remaining',
    'daily_min_spend_target', 'daily_spend_cap', 'lifetime_min_spend_target', 'lifetime_spend_cap',
    'bid_amount', 'bid_strategy', 'bid_constraints', 'pacing_type',
    'optimization_goal', 'optimization_sub_event', 'billing_event',
    'destination_type', 'promoted_object',
    'targeting', 'targeting_optimization_types',
    'frequency_control_specs', 'attribution_spec',
    'start_time', 'end_time', 'created_time', 'updated_time',
    'is_dynamic_creative', 'learning_stage_info', 'issues_info',
    'adlabels', 'instagram_actor_id', 'source_adset_id',
  ].join(',');

  // ── ACCOUNT COOLDOWN CHECK ───────────────────────────────────────────────
  // If this campaign's ad account recently hit a rate limit, serve from cache
  // rather than immediately hammering Meta again.
  const accountId = getAccountIdFromCache(id);
  if (isAccountCoolingDown(accountId)) {
    const listCached = cacheGet(`list:${datePreset}`);
    const fromList = listCached?.campaigns?.find((c) => c.id === id);
    if (fromList) {
      return res.json({
        success: true,
        date_preset: datePreset,
        _degraded: true,
        _degraded_reason: 'Meta rate limit cooling down — full data will be available shortly',
        campaign: { ...fromList, adsets: [] },
      });
    }
    return res.json(RATE_LIMIT_RESPONSE);
  }

  // ── CRITICAL PATH: 1 Meta call (campaign + adsets via field expansion) ───
  // Combining these into one call halves the Meta API cost per detail load.
  let campaign, adSets;
  try {
    const campaignResp = await withRateLimitRetry(
      () => axios.get(`${BASE}/${id}`, {
        params: {
          access_token: token,
          fields: [
            'id', 'name', 'objective', 'status', 'effective_status', 'configured_status',
            'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap',
            'bid_strategy', 'buying_type', 'pacing_type',
            'start_time', 'stop_time', 'created_time', 'updated_time',
            'special_ad_categories', 'special_ad_category_country',
            'promoted_object', 'issues_info', 'adlabels', 'source_campaign_id',
            `adsets.limit(100){${ADSET_FIELDS}}`,
          ].join(','),
        },
      }),
      1,    // 1 retry
      3000  // after 3 seconds
    );
    campaign = { ...campaignResp.data };
    adSets = campaign.adsets?.data || [];
    delete campaign.adsets; // keep campaign clean; adsets go into finalAdSets below
  } catch (err) {
    if (isRateLimit(err)) {
      markAccountRateLimited(accountId);
      const listCached = cacheGet(`list:${datePreset}`);
      const fromList = listCached?.campaigns?.find((c) => c.id === id);
      if (fromList) {
        return res.json({
          success: true,
          date_preset: datePreset,
          _degraded: true,
          _degraded_reason: 'Meta rate limit — adsets temporarily unavailable',
          campaign: { ...fromList, adsets: [] },
        });
      }
      return res.json(RATE_LIMIT_RESPONSE);
    }
    return res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }

  // ── OPTIONAL PATH: ads + insights (fail silently — never blocks the page) ─
  // 500ms gap before the second burst.
  await new Promise((r) => setTimeout(r, 500));

  const optionalResults = await Promise.allSettled([
    axios.get(`${BASE}/${id}/ads`, { params: { access_token: token, fields: AD_FIELDS, limit: 200 } }),
    axios.get(`${BASE}/${id}/insights`, { params: insightParams }),
    axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, level: 'adset' } }),
    axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, level: 'ad' } }),
  ]);

  // Mark account if any call rate-limited (reactive)
  if (optionalResults.some((r) => r.status === 'rejected' && isRateLimit(r.reason))) {
    markAccountRateLimited(accountId);
  }

  const [allAdsResp, campaignInsightResp, adsetInsightResp, adInsightResp] =
    optionalResults.map((r) => (r.status === 'fulfilled' ? r.value : null));

  // Check throttle headers on insight responses (proactive — catches 80-95% before code 17)
  checkThrottleHeader(campaignInsightResp, accountId);
  checkThrottleHeader(adsetInsightResp, accountId);
  checkThrottleHeader(adInsightResp, accountId);

  const allAds = allAdsResp?.data?.data || [];

  // Build lookup maps: entity id → normalised insight row
  const adsetInsightMap = {};
  for (const row of (adsetInsightResp?.data?.data || [])) {
    adsetInsightMap[row.adset_id] = normalizeActions([row]);
  }
  const adInsightMap = {};
  for (const row of (adInsightResp?.data?.data || [])) {
    adInsightMap[row.ad_id] = normalizeActions([row]);
  }

  // Group ads by adset_id
  const adsByAdset = {};
  for (const ad of allAds) {
    if (!adsByAdset[ad.adset_id]) adsByAdset[ad.adset_id] = [];
    adsByAdset[ad.adset_id].push(ad);
  }

  const finalAdSets = adSets.map((adset) => ({
    ...adset,
    insights: adsetInsightMap[adset.id] || null,
    ads: (adsByAdset[adset.id] || []).map((ad) => ({
      ...ad,
      insights: adInsightMap[ad.id] || null,
    })),
  }));

  const normalizeBreakdown = (resp) => (resp?.data?.data || []).map((row) => normalizeActions([row]));

  // ── BREAKDOWNS: only when caller passes ?include_breakdowns=true ──────────
  let breakdowns = {};
  if (includeBreakdowns) {
    await new Promise((r) => setTimeout(r, 500));
    const [ageBd, genderBd, placementBd, countryBd, deviceBd, dailyBd] = await Promise.all([
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'age' } }).catch(() => null),
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'gender' } }).catch(() => null),
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'publisher_platform,platform_position' } }).catch(() => null),
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'country' } }).catch(() => null),
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'impression_device' } }).catch(() => null),
      axios.get(`${BASE}/${id}/insights`, { params: { ...insightParams, fields: BREAKDOWN_FIELDS, time_increment: 1 } }).catch(() => null),
    ]);
    breakdowns = {
      insights_by_age:       normalizeBreakdown(ageBd),
      insights_by_gender:    normalizeBreakdown(genderBd),
      insights_by_placement: normalizeBreakdown(placementBd),
      insights_by_country:   normalizeBreakdown(countryBd),
      insights_by_device:    normalizeBreakdown(deviceBd),
      insights_daily:        normalizeBreakdown(dailyBd),
    };
  }

  const responseData = {
    success: true,
    date_preset: datePreset,
    campaign: {
      ...campaign,
      insights: normalizeActions(campaignInsightResp?.data?.data),
      ...breakdowns,
      adsets: finalAdSets,
    },
  };

  // Maximum (all-time) barely changes — cache for 2 hours; others 30 minutes
  const ttl = datePreset === 'maximum' ? 2 * 60 * 60_000 : 30 * 60_000;
  cacheSet(cacheKey, responseData, ttl);
  res.json(responseData);
};

exports.updateCampaign = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Campaign ID is required.' });

  try {
    const {
      name,
      status,
      daily_budget,
      lifetime_budget,
      bid_strategy,
      start_time,
      stop_time,
    } = req.body;

    const payload = { access_token: getToken() };

    if (name)            payload.name            = name;
    if (status)          payload.status          = status;
    if (daily_budget)    payload.daily_budget    = daily_budget;
    if (lifetime_budget) payload.lifetime_budget = lifetime_budget;
    if (bid_strategy)    payload.bid_strategy    = bid_strategy;
    if (start_time)      payload.start_time      = start_time;
    if (stop_time)       payload.stop_time       = stop_time;

    await axios.post(
      `${BASE}/${id}`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Campaign ${id} updated.`);
    res.json({ success: true, updated_campaign_id: id });
  } catch (err) {
    console.error('Campaign update error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.deleteCampaign = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Campaign ID is required.' });

  try {
    await axios.delete(`${BASE}/${id}`, {
      params: { access_token: getToken() },
    });

    console.log(`Campaign ${id} deleted.`);
    res.json({ success: true, deleted_campaign_id: id });
  } catch (err) {
    console.error('Campaign delete error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

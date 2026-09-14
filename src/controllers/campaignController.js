const axios = require('axios');

const BASE = 'https://graph.facebook.com/v25.0';

const getToken = () => process.env.META_USER_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;

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

    // Fetch insights for every campaign in parallel
    const insightResults = await Promise.allSettled(
      allCampaigns.map((c) =>
        axios.get(`${BASE}/${c.id}/insights`, {
          params: {
            access_token: token,
            fields: LIST_INSIGHT_FIELDS,
            date_preset: datePreset,
          },
        })
      )
    );

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

    res.json({ success: true, date_preset: datePreset, campaigns: campaignsWithInsights, accounts });
  } catch (err) {
    console.error('Error fetching campaigns:', err.response?.data || err.message);
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

  // Valid Meta date presets. Map "lifetime" → "maximum" for convenience.
  const VALID_PRESETS = new Set([
    'today','yesterday','this_month','last_month','this_quarter',
    'maximum','data_maximum',
    'last_3d','last_7d','last_14d','last_28d','last_30d','last_90d',
    'last_week_mon_sun','last_week_sun_sat','last_quarter','last_year',
    'this_week_mon_today','this_week_sun_today','this_year',
  ]);
  const rawPreset = req.query.date_preset || 'last_30d';
  const datePreset = rawPreset === 'lifetime' ? 'maximum' : (VALID_PRESETS.has(rawPreset) ? rawPreset : 'last_30d');

  try {
    const token = getToken();

    const insightParams = {
      access_token: token,
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
    };

    const BREAKDOWN_FIELDS = 'spend,reach,impressions,clicks,ctr,cpm,cpc,actions,cost_per_action_type,action_values,date_start,date_stop';

    // Fetch everything in parallel — config, adsets, aggregate insights, breakdowns, daily series
    const [
      campaignResp,
      adSetsResp,
      campaignInsightResp,
      ageBreakdownResp,
      genderBreakdownResp,
      placementBreakdownResp,
      countryBreakdownResp,
      deviceBreakdownResp,
      dailySeriesResp,
    ] = await Promise.all([
      axios.get(`${BASE}/${id}`, {
        params: {
          access_token: token,
          fields: [
            'id', 'name', 'objective', 'status', 'effective_status', 'configured_status',
            'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap',
            'bid_strategy', 'buying_type', 'pacing_type',
            'start_time', 'stop_time', 'created_time', 'updated_time',
            'special_ad_categories', 'special_ad_category_country',
            'promoted_object', 'issues_info', 'adlabels', 'source_campaign_id',
          ].join(','),
        },
      }),
      axios.get(`${BASE}/${id}/adsets`, {
        params: {
          access_token: token,
          fields: [
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
          ].join(','),
          limit: 100,
        },
      }),
      // Aggregate insights
      axios.get(`${BASE}/${id}/insights`, { params: insightParams }).catch(() => null),
      // Breakdown by age
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'age' },
      }).catch(() => null),
      // Breakdown by gender
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'gender' },
      }).catch(() => null),
      // Breakdown by placement (platform + position)
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'publisher_platform,platform_position' },
      }).catch(() => null),
      // Breakdown by country
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'country' },
      }).catch(() => null),
      // Breakdown by device
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, breakdowns: 'impression_device' },
      }).catch(() => null),
      // Daily time series for charts (time_increment=1 means 1 row per day)
      axios.get(`${BASE}/${id}/insights`, {
        params: { ...insightParams, fields: BREAKDOWN_FIELDS, time_increment: 1 },
      }).catch(() => null),
    ]);

    const campaign = campaignResp.data;
    const adSets = adSetsResp.data.data || [];
    const campaignInsights = normalizeActions(campaignInsightResp?.data?.data);

    // Normalize breakdown rows (keep as array, normalize actions in each row)
    const normalizeBreakdown = (resp) => {
      const rows = resp?.data?.data || [];
      return rows.map((row) => normalizeActions([row]));
    };

    // Fetch ads + adset insights for every adset in parallel
    const adAndInsightResults = await Promise.allSettled(
      adSets.map((adset) =>
        Promise.all([
          axios.get(`${BASE}/${adset.id}/ads`, {
            params: {
              access_token: token,
              fields: [
                'id', 'name', 'adset_id', 'campaign_id',
                'status', 'effective_status', 'configured_status',
                'creative{id,name,title,body,image_url,thumbnail_url,object_story_spec,call_to_action_type,link_url}',
                'bid_amount', 'bid_type', 'bid_info',
                'tracking_specs', 'conversion_specs',
                'review_feedback', 'issues_info',
                'preview_shareable_link',
                'created_time', 'updated_time',
              ].join(','),
              limit: 100,
            },
          }),
          axios.get(`${BASE}/${adset.id}/insights`, { params: insightParams }).catch(() => null),
        ])
      )
    );

    // Build adsets with their ads + insights, and fetch ad-level insights in parallel
    const adInsightFetches = [];
    const adSetsWithAds = adSets.map((adset, i) => {
      const [adsResp, adsetInsightResp] = adAndInsightResults[i].status === 'fulfilled'
        ? adAndInsightResults[i].value
        : [null, null];

      const ads = adsResp?.data?.data || [];
      const adsetInsights = normalizeActions(adsetInsightResp?.data?.data);

      ads.forEach((ad) => {
        adInsightFetches.push(
          axios.get(`${BASE}/${ad.id}/insights`, { params: insightParams }).catch(() => null)
        );
      });

      return { adset, adsetInsights, ads };
    });

    const adInsightResults = await Promise.allSettled(adInsightFetches);

    // Attach ad-level insights back to each ad
    let insightIdx = 0;
    const finalAdSets = adSetsWithAds.map(({ adset, adsetInsights, ads }) => ({
      ...adset,
      insights: adsetInsights,
      ads: ads.map((ad) => {
        const insightResp = adInsightResults[insightIdx++];
        const adInsights = normalizeActions(
          insightResp?.status === 'fulfilled' ? insightResp.value?.data?.data : null
        );
        return { ...ad, insights: adInsights };
      }),
    }));

    res.json({
      success: true,
      date_preset: datePreset,
      campaign: {
        ...campaign,
        insights: campaignInsights,
        insights_by_age:       normalizeBreakdown(ageBreakdownResp),
        insights_by_gender:    normalizeBreakdown(genderBreakdownResp),
        insights_by_placement: normalizeBreakdown(placementBreakdownResp),
        insights_by_country:   normalizeBreakdown(countryBreakdownResp),
        insights_by_device:    normalizeBreakdown(deviceBreakdownResp),
        insights_daily:        normalizeBreakdown(dailySeriesResp),
        adsets: finalAdSets,
      },
    });
  } catch (err) {
    console.error('Error fetching campaign details:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
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

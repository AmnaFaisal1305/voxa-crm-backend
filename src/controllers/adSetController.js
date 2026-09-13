const axios = require('axios');

const BASE = 'https://graph.facebook.com/v25.0';
const getToken = () => process.env.META_PAGE_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;

exports.getAdSets = async (req, res) => {
  try {
    const { campaign_id } = req.query;

    const url = campaign_id
      ? `${BASE}/${campaign_id}/adsets`
      : `${BASE}/${getAdAccount()}/adsets`;

    const { data } = await axios.get(url, {
      params: {
        access_token: getToken(),
        fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,targeting,optimization_goal,billing_event,created_time',
        limit: 100,
      },
    });

    res.json({ success: true, adsets: data.data || [] });
  } catch (err) {
    console.error('Error fetching ad sets:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.createAdSet = async (req, res) => {
  try {
    const {
      name,
      campaign_id,
      daily_budget,
      lifetime_budget,
      start_time,
      end_time,
      status = 'PAUSED',
      targeting,
      optimization_goal = 'LEAD_GENERATION',
      billing_event = 'IMPRESSIONS',
      bid_amount,
    } = req.body;

    if (!name || !campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'name and campaign_id are required.',
      });
    }

    // Fetch campaign to check bid_strategy and whether CBO is enabled
    const { data: campaign } = await axios.get(`${BASE}/${campaign_id}`, {
      params: { access_token: getToken(), fields: 'daily_budget,lifetime_budget,bid_strategy' },
    });

    const campaignHasBudget = campaign.daily_budget || campaign.lifetime_budget;
    const bidStrategy = campaign.bid_strategy || 'LOWEST_COST_WITHOUT_CAP';

    // bid_amount is required when campaign uses a cap-based bid strategy
    const needsBidAmount = ['LOWEST_COST_WITH_BID_CAP', 'TARGET_COST'].includes(bidStrategy);
    if (needsBidAmount && !bid_amount) {
      return res.status(400).json({
        success: false,
        error: `Your campaign uses ${bidStrategy} — you must provide bid_amount (in cents) on the ad set. Example: bid_amount: 500 = PKR 5 max bid.`,
      });
    }

    const payload = {
      name,
      campaign_id,
      optimization_goal,
      billing_event,
      status,
      access_token: getToken(),
      targeting: JSON.stringify(targeting || {
        age_min: 18,
        age_max: 65,
        geo_locations: { countries: ['PK'] },
      }),
    };

    // If campaign has CBO budget, ad set must NOT set its own budget
    if (!campaignHasBudget) {
      if (daily_budget)    payload.daily_budget    = daily_budget;
      if (lifetime_budget) payload.lifetime_budget = lifetime_budget;
    }

    if (start_time)  payload.start_time  = start_time;
    if (end_time)    payload.end_time    = end_time;
    if (bid_amount)  payload.bid_amount  = bid_amount;

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/adsets`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Ad Set "${name}" created with ID: ${data.id}`);
    res.json({ success: true, adset_id: data.id });
  } catch (err) {
    console.error('Ad set creation error:', err.response?.data || err.message);
    const metaErr = err.response?.data?.error;
    res.status(500).json({
      success: false,
      error: metaErr?.error_user_msg || metaErr?.message || err.message,
    });
  }
};

exports.updateAdSet = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Ad Set ID is required.' });

  try {
    const {
      name, status, daily_budget, lifetime_budget,
      start_time, end_time, targeting, bid_amount,
    } = req.body;

    const payload = { access_token: getToken() };

    if (name)            payload.name            = name;
    if (status)          payload.status          = status;
    if (daily_budget)    payload.daily_budget    = daily_budget;
    if (lifetime_budget) payload.lifetime_budget = lifetime_budget;
    if (start_time)      payload.start_time      = start_time;
    if (end_time)        payload.end_time        = end_time;
    if (bid_amount)      payload.bid_amount      = bid_amount;
    if (targeting)       payload.targeting       = JSON.stringify(targeting);

    await axios.post(
      `${BASE}/${id}`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    res.json({ success: true, updated_adset_id: id });
  } catch (err) {
    console.error('Ad set update error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.deleteAdSet = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Ad Set ID is required.' });

  try {
    await axios.delete(`${BASE}/${id}`, {
      params: { access_token: getToken() },
    });

    res.json({ success: true, deleted_adset_id: id });
  } catch (err) {
    console.error('Ad set delete error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

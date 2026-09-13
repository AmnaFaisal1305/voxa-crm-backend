const axios = require('axios');

const BASE = 'https://graph.facebook.com/v25.0';

const getToken = () => process.env.META_PAGE_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;

exports.getCampaigns = async (req, res) => {
  try {
    const { data } = await axios.get(
      `${BASE}/${getAdAccount()}/campaigns`,
      {
        params: {
          access_token: getToken(),
          fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_strategy,start_time,stop_time,special_ad_categories,created_time',
          limit: 100,
        },
      }
    );

    res.json({ success: true, campaigns: data.data || [] });
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

    if (daily_budget)   payload.daily_budget   = daily_budget;
    if (lifetime_budget) payload.lifetime_budget = lifetime_budget;
    if (bid_strategy)   payload.bid_strategy   = bid_strategy;
    if (start_time)     payload.start_time     = start_time;
    if (stop_time)      payload.stop_time      = stop_time;

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/campaigns`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Campaign "${name}" created with ID: ${data.id}`);
    res.json({ success: true, campaign_id: data.id });
  } catch (err) {
    console.error('Campaign creation error:', err.response?.data || err.message);
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

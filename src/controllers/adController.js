const axios = require('axios');

const BASE = 'https://graph.facebook.com/v25.0';
const getToken = () => process.env.META_PAGE_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;

exports.getAds = async (req, res) => {
  try {
    const { adset_id } = req.query;

    const url = adset_id
      ? `${BASE}/${adset_id}/ads`
      : `${BASE}/${getAdAccount()}/ads`;

    const { data } = await axios.get(url, {
      params: {
        access_token: getToken(),
        fields: 'id,name,adset_id,campaign_id,status,effective_status,creative,created_time',
        limit: 100,
      },
    });

    res.json({ success: true, ads: data.data || [] });
  } catch (err) {
    console.error('Error fetching ads:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.createAd = async (req, res) => {
  try {
    const {
      name,
      adset_id,
      creative_id,
      status = 'PAUSED',
    } = req.body;

    if (!name || !adset_id || !creative_id) {
      return res.status(400).json({
        success: false,
        error: 'name, adset_id, and creative_id are required.',
      });
    }

    const payload = {
      name,
      adset_id,
      creative: JSON.stringify({ creative_id }),
      status,
      access_token: getToken(),
    };

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/ads`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Ad "${name}" created with ID: ${data.id}`);
    res.json({ success: true, ad_id: data.id });
  } catch (err) {
    console.error('Ad creation error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.updateAd = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Ad ID is required.' });

  try {
    const { name, status } = req.body;

    const payload = { access_token: getToken() };
    if (name)   payload.name   = name;
    if (status) payload.status = status;

    await axios.post(
      `${BASE}/${id}`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    res.json({ success: true, updated_ad_id: id });
  } catch (err) {
    console.error('Ad update error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.deleteAd = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Ad ID is required.' });

  try {
    await axios.delete(`${BASE}/${id}`, {
      params: { access_token: getToken() },
    });

    res.json({ success: true, deleted_ad_id: id });
  } catch (err) {
    console.error('Ad delete error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

const axios = require('axios');
const pool = require('../config/db');

/**
 * Creates a Leadgen Form on Meta Ads and saves its reference locally.
 * React Frontend sends form name, questions, and optional privacy policy URL.
 */
exports.createForm = async (req, res) => {
  try {
    const { name, questions, privacy_policy } = req.body;
    
    if (!name || !questions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name and questions are required.'
      });
    }

    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    const pageId = process.env.META_PAGE_ID;

    // Build the payload as required by Meta Lead Ads Form API
    const payload = {
      name,
      questions: typeof questions === 'string' ? questions : JSON.stringify(questions),
      privacy_policy: JSON.stringify(privacy_policy || { url: 'https://voxa-crm.vercel.app/privacy-policy' }),
      locale: 'en_US',
      page_id: pageId,
      access_token: token
    };

    const url = `https://graph.facebook.com/v22.0/${adAccountId}/leadgen_forms`;
    
    console.log(`Publishing form "${name}" to Meta Ad Account ${adAccountId}`);
    
    const { data } = await axios.post(
      url,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Save the created form details to the database
    await pool.query(
      `INSERT INTO meta_forms (form_name, meta_form_id, page_id, ad_account_id)
       VALUES ($1, $2, $3, $4)`,
      [name, data.id, pageId, adAccountId]
    );

    console.log(`Form "${name}" successfully created on Meta with ID: ${data.id}`);
    res.json({ success: true, form_id: data.id });
  } catch (err) {
    console.error('Form creation error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};

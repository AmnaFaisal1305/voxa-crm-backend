const axios = require('axios');
const pool = require('../config/db');

exports.getForms = async (req, res) => {
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;

    const { data } = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/leadgen_forms`,
      { params: { access_token: token, fields: 'id,name,status,created_time,leads_count', limit: 100 } }
    );

    // Flag forms that were created through VOXA
    const dbResult = await pool.query('SELECT meta_form_id FROM meta_forms');
    const voxaFormIds = new Set(dbResult.rows.map(r => r.meta_form_id));

    const forms = (data.data || []).map(form => ({
      id:               form.id,
      name:             form.name,
      status:           form.status,
      created_time:     form.created_time,
      leads_count:      form.leads_count ?? 0,
      created_via_voxa: voxaFormIds.has(form.id),
    }));

    res.json({ success: true, forms });
  } catch (err) {
    console.error('Error fetching forms:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

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

    // Meta built-in types must not include label or key — only CUSTOM types get those fields
    const BUILTIN_TYPES = ['FULL_NAME', 'EMAIL', 'PHONE', 'DATE_TIME', 'STREET_ADDRESS', 'CITY', 'STATE', 'COUNTRY', 'ZIP', 'POST_CODE', 'GENDER', 'MARITAL_STATUS', 'RELATIONSHIP_STATUS', 'MILITARY_STATUS', 'WORK_PHONE_NUMBER', 'WORK_EMAIL'];
    const sanitizedQuestions = (Array.isArray(questions) ? questions : JSON.parse(questions)).map(q => {
      if (BUILTIN_TYPES.includes(q.type)) return { type: q.type };
      return { type: q.type, label: q.label, key: q.key };
    });

    // Build the payload as required by Meta Lead Ads Form API
    const payload = {
      name,
      questions: JSON.stringify(sanitizedQuestions),
      privacy_policy: JSON.stringify(privacy_policy || { url: 'https://voxa-crm.vercel.app/privacy-policy' }),
      follow_up_action_url: 'https://voxa-crm.vercel.app',
      locale: 'en_US',
      page_id: pageId,
      access_token: token
    };

    const url = `https://graph.facebook.com/v25.0/${pageId}/leadgen_forms`;
    
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

const axios = require('axios');
const pool = require('../config/db');

/**
 * Verification handler for Meta webhook registration.
 * Meta Developer Portal calls this with hub.mode, hub.verify_token, and hub.challenge.
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully.');
    return res.status(200).send(challenge);
  }
  
  console.warn('Webhook verification failed: token mismatch or incorrect mode.');
  res.sendStatus(403);
};

/**
 * Post handler for receiving Lead Ads webhook notifications from Meta.
 * Resolves within 5 seconds to satisfy Meta API requirements, then processes the lead.
 */
exports.receiveWebhook = async (req, res) => {
  // Respond immediately with 200 OK to prevent webhook retry and timeouts
  res.status(200).send('EVENT_RECEIVED');

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    
    if (change?.field !== 'leadgen') {
      return;
    }

    const leadgenId = change.value.leadgen_id;
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const url = `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${token}`;

    console.log(`Processing lead event for leadgen_id: ${leadgenId}`);
    
    // Fetch full lead details using the leadgen_id
    const { data } = await axios.get(url);

    // Map field_data into key-value pairs
    const fields = {};
    if (data.field_data && Array.isArray(data.field_data)) {
      data.field_data.forEach(f => {
        fields[f.name] = f.values?.[0] || '';
      });
    }

    // Try to get phone from phone_number or other variant keys
    const phone = fields.phone_number || fields.phone || '';
    const fullName = fields.full_name || fields.name || '';
    const email = fields.email || '';

    // Insert lead data into PostgreSQL
    await pool.query(
      `INSERT INTO leads (full_name, email, phone, form_id, raw_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fullName,
        email,
        phone,
        data.form_id || '',
        JSON.stringify(data)
      ]
    );

    console.log(`Successfully stored lead ${fullName} (Form ID: ${data.form_id}) in the database.`);
  } catch (err) {
    console.error('Webhook processing error:', err.response?.data || err.message);
  }
};

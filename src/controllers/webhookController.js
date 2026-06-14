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
 * Processes the lead first, then responds 200 — required because Vercel serverless
 * terminates the function immediately after res.send(), killing any async work after it.
 * Meta's 5-second response window is met since fetch + DB insert takes ~1-2 seconds.
 */
exports.receiveWebhook = async (req, res) => {
  try {
    const entry  = req.body.entry?.[0];
    const change = entry?.changes?.[0];

    if (change?.field !== 'leadgen') {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const leadgenId = change.value.leadgen_id;
    const formId    = change.value.form_id || '';   // form_id comes from the webhook payload, not the leadgen fetch
    const token     = process.env.META_PAGE_ACCESS_TOKEN;
    const url       = `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${token}`;

    console.log(`Processing lead event for leadgen_id: ${leadgenId}, form_id: ${formId}`);

    const { data } = await axios.get(url);

    const fields = {};
    if (data.field_data && Array.isArray(data.field_data)) {
      data.field_data.forEach(f => { fields[f.name] = f.values?.[0] || ''; });
    }

    const fullName = fields.full_name    || fields.name  || '';
    const email    = fields.email        || '';
    const phone    = fields.phone_number || fields.phone  || '';

    await pool.query(
      `INSERT INTO leads (full_name, email, phone, form_id, raw_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, email, phone, formId, JSON.stringify(data)]
    );

    console.log(`Stored lead: ${fullName} | ${email} | ${phone}`);
  } catch (err) {
    console.error('Webhook processing error:', err.response?.data || err.message);
  } finally {
    res.status(200).send('EVENT_RECEIVED');
  }
};

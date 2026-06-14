const axios = require('axios');
const pool = require('../config/db');

// Warm up DB connection on cold start so the first webhook doesn't pay the full connection cost
pool.query('SELECT 1').catch(() => {});

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
 * Processes the lead first, responds 200 in finally — guarantees the DB insert
 * completes before the response is sent. Vercel freezes the function after res.send()
 * when Meta closes the connection, so async-after-respond is not reliable here.
 * The module-level warm-up query above eliminates the Neon cold-start delay so
 * processing consistently completes within Meta's 5-second window.
 */
exports.receiveWebhook = async (req, res) => {
  try {
    const entry  = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== 'leadgen') return res.status(200).send('EVENT_RECEIVED');

    const leadgenId = change.value.leadgen_id;
    const formId    = change.value.form_id || '';
    const token     = process.env.META_PAGE_ACCESS_TOKEN;
    const url       = `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${token}`;

    console.log(`Processing lead: leadgen_id=${leadgenId} form_id=${formId}`);

    const { data } = await axios.get(url);

    const fields = {};
    data.field_data?.forEach(f => { fields[f.name] = f.values?.[0] || ''; });

    const fullName = fields.full_name    || fields.name  || '';
    const email    = fields.email        || '';
    const phone    = fields.phone_number || fields.phone  || '';

    await pool.query(
      `INSERT INTO leads (full_name, email, phone, form_id, raw_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, email, phone, formId, JSON.stringify(data)]
    );

    console.log(`Stored: ${fullName} | ${email} | ${phone}`);
  } catch (err) {
    console.error('Webhook error:', err.response?.data || err.message);
  } finally {
    res.status(200).send('EVENT_RECEIVED');
  }
};

const axios = require('axios');
const pool = require('../config/db');

exports.getConversations = async (req, res) => {
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;

    const { data } = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/conversations`,
      { params: { platform: 'messenger', fields: 'participants,snippet,updated_time', access_token: token, limit: 100 } }
    );

    const conversations = (data.data || []).map(conv => {
      const customer = (conv.participants?.data || []).find(p => p.id !== pageId);
      return {
        thread_id:    conv.id,
        psid:         customer?.id   || null,
        display_name: customer?.name || null,
        snippet:      conv.snippet,
        updated_time: conv.updated_time,
      };
    });

    res.json({ success: true, conversations });
  } catch (err) {
    console.error('Error fetching conversations:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

exports.getThread = async (req, res) => {
  const { psid } = req.params;
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;

    // Step 1 — find the conversation thread ID for this PSID
    const convRes = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/conversations`,
      { params: { platform: 'messenger', user_id: psid, fields: 'id', access_token: token } }
    );
    const threadId = convRes.data?.data?.[0]?.id;
    if (!threadId) return res.json({ success: true, messages: [] });

    // Step 2 — fetch messages for that thread, newest first (Meta default), then reverse
    const msgRes = await axios.get(
      `https://graph.facebook.com/v25.0/${threadId}/messages`,
      { params: { fields: 'message,from,created_time', access_token: token, limit: 100 } }
    );

    const messages = (msgRes.data?.data || [])
      .reverse()
      .map(m => ({
        direction: m.from?.id === pageId ? 'outbound' : 'inbound',
        content:   m.message || '',
        sent_at:   m.created_time,
      }));

    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error fetching thread:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

exports.sendMessage = async (req, res) => {
  const { psid, text } = req.body;
  if (!psid || !text) {
    return res.status(400).json({ success: false, error: 'psid and text are required.' });
  }
  try {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    await axios.post(
      `https://graph.facebook.com/v25.0/me/messages`,
      { recipient: { id: psid }, message: { text } },
      { params: { access_token: token } }
    );

    const convRow = await pool.query(
      `INSERT INTO conversations (psid, last_message_at)
       VALUES ($1, NOW())
       ON CONFLICT (psid) DO UPDATE SET last_message_at = NOW()
       RETURNING id`,
      [psid]
    );
    const conversationId = convRow.rows[0].id;

    await pool.query(
      `INSERT INTO messages (conversation_id, direction, content)
       VALUES ($1, 'outbound', $2)`,
      [conversationId, text]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Send message error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

exports.handleInboundMessage = async (psid, text, mid) => {
  const convRow = await pool.query(
    `INSERT INTO conversations (psid, last_message_at)
     VALUES ($1, NOW())
     ON CONFLICT (psid) DO UPDATE SET last_message_at = NOW()
     RETURNING id`,
    [psid]
  );
  const conversationId = convRow.rows[0].id;

  await pool.query(
    `INSERT INTO messages (conversation_id, direction, content, mid)
     VALUES ($1, 'inbound', $2, $3)
     ON CONFLICT (mid) DO NOTHING`,
    [conversationId, text, mid]
  );
};

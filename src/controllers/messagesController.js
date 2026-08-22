const axios = require('axios');
const pool = require('../config/db');

exports.getConversations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.psid, c.display_name, c.last_message_at,
              m.content AS last_message, m.direction AS last_direction
       FROM conversations c
       LEFT JOIN LATERAL (
         SELECT content, direction FROM messages
         WHERE conversation_id = c.id
         ORDER BY sent_at DESC LIMIT 1
       ) m ON true
       ORDER BY c.last_message_at DESC NULLS LAST`
    );
    res.json({ success: true, conversations: result.rows });
  } catch (err) {
    console.error('Error fetching conversations:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getThread = async (req, res) => {
  const { psid } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.direction, m.content, m.sent_at
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.psid = $1
       ORDER BY m.sent_at ASC`,
      [psid]
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error('Error fetching thread:', err.message);
    res.status(500).json({ success: false, error: err.message });
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

const pool = require('../config/db');

/**
 * Retrieves leads from the database.
 * Returns up to 100 recent leads ordered by creation time.
 */
exports.getLeads = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, form_id, form_name,
              lead_status, assigned_agent, created_at
       FROM leads
       ORDER BY created_at DESC
       LIMIT 100`
    );
    
    res.json({
      success: true,
      leads: result.rows
    });
  } catch (err) {
    console.error('Error fetching leads:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

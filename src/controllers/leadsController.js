const pool = require('../config/db');

/**
 * Retrieves leads from the database.
 * Returns up to 100 recent leads ordered by creation time.
 */
exports.getLeads = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.full_name, l.email, l.phone, l.form_id,
              COALESCE(l.form_name, mf.form_name) AS form_name,
              l.lead_status, l.assigned_agent, l.created_at
       FROM leads l
       LEFT JOIN meta_forms mf ON l.form_id = mf.meta_form_id
       ORDER BY l.created_at DESC
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

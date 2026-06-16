const axios = require('axios');
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

/**
 * Fetches all existing leads from Meta for every form on the page
 * and stores any not already in the DB. Safe to call multiple times.
 */
exports.syncLeads = async (req, res) => {
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;

    const { data: formsData } = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/leadgen_forms`,
      { params: { access_token: token, fields: 'id,name,leads_count', limit: 100 } }
    );

    let inserted = 0;
    let skipped  = 0;

    for (const form of (formsData.data || [])) {
      if (!form.leads_count || form.leads_count === 0) continue;

      const { data: leadsData } = await axios.get(
        `https://graph.facebook.com/v25.0/${form.id}/leads`,
        { params: { access_token: token, fields: 'id,created_time,field_data', limit: 100 } }
      );

      for (const lead of (leadsData.data || [])) {
        const fields = {};
        lead.field_data?.forEach(f => { fields[f.name] = f.values?.[0] || ''; });

        const fullName = fields.full_name    || fields.name  || '';
        const email    = fields.email        || '';
        const phone    = fields.phone_number || fields.phone || '';

        // Patch form_name on any existing lead that was stored without it
        await pool.query(
          `UPDATE leads SET form_name = $1
           WHERE raw_data::json->>'id' = $2 AND form_name IS NULL`,
          [form.name, lead.id]
        );

        // Insert if not already present
        const result = await pool.query(
          `INSERT INTO leads (full_name, email, phone, form_id, form_name, raw_data)
           SELECT $1, $2, $3, $4, $5, $6
           WHERE NOT EXISTS (
             SELECT 1 FROM leads WHERE raw_data::json->>'id' = $7
           )`,
          [fullName, email, phone, form.id, form.name, JSON.stringify(lead), lead.id]
        );

        if (result.rowCount > 0) inserted++;
        else skipped++;
      }
    }

    console.log(`Sync complete: ${inserted} inserted, ${skipped} skipped`);
    res.json({ success: true, inserted, skipped });
  } catch (err) {
    console.error('Sync leads error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

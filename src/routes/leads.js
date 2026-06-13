const express = require('express');
const router = express.Router();
const { getLeads } = require('../controllers/leadsController');

// React calls GET /api/leads to retrieve list of captured leads
router.get('/', getLeads);

module.exports = router;

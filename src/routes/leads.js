const express = require('express');
const router = express.Router();
const { getLeads, syncLeads } = require('../controllers/leadsController');

router.get('/', getLeads);
router.post('/sync', syncLeads);

module.exports = router;

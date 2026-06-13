const express = require('express');
const router = express.Router();
const { verifyWebhook, receiveWebhook } = require('../controllers/webhookController');

// Meta calls GET /webhook to verify subscription token
router.get('/', verifyWebhook);

// Meta calls POST /webhook to notify us about a new lead submission
router.post('/', receiveWebhook);

module.exports = router;

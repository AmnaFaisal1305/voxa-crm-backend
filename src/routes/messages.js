const express = require('express');
const router = express.Router();
const { getConversations, getThread, sendMessage } = require('../controllers/messagesController');

router.get('/', getConversations);
router.post('/send', sendMessage);
router.get('/:psid', getThread);

module.exports = router;

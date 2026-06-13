const express = require('express');
const router = express.Router();
const { createForm } = require('../controllers/formController');

// React calls POST /api/forms/create to publish a form to Meta
router.post('/create', createForm);

module.exports = router;

const express = require('express');
const router = express.Router();
const { createForm, getForms } = require('../controllers/formController');

router.get('/', getForms);
router.post('/create', createForm);

module.exports = router;

const express = require('express');
const router = express.Router();
const { createForm, getForms, archiveForm } = require('../controllers/formController');

router.get('/', getForms);
router.post('/create', createForm);
router.delete('/:id', archiveForm);

module.exports = router;

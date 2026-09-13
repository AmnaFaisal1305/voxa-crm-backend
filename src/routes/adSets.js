const express = require('express');
const router = express.Router();
const { getAdSets, createAdSet, updateAdSet, deleteAdSet } = require('../controllers/adSetController');

router.get('/', getAdSets);
router.post('/create', createAdSet);
router.patch('/:id', updateAdSet);
router.delete('/:id', deleteAdSet);

module.exports = router;

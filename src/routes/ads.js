const express = require('express');
const router = express.Router();
const { getAds, createAd, updateAd, deleteAd } = require('../controllers/adController');

router.get('/', getAds);
router.post('/create', createAd);
router.patch('/:id', updateAd);
router.delete('/:id', deleteAd);

module.exports = router;

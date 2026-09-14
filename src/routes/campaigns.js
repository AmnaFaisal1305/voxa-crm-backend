const express = require('express');
const router = express.Router();
const {
  getCampaigns,
  getCampaignDetails,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} = require('../controllers/campaignController');

router.get('/', getCampaigns);
router.get('/:id', getCampaignDetails);
router.post('/create', createCampaign);
router.patch('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);

module.exports = router;

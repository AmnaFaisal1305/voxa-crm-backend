const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadImage, createAdCreative, getAdCreatives, deleteAdCreative } = require('../controllers/adCreativeController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.get('/', getAdCreatives);
router.post('/upload-image', upload.single('image'), uploadImage);
router.post('/create', createAdCreative);
router.delete('/:id', deleteAdCreative);

module.exports = router;

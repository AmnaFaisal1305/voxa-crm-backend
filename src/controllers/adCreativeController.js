const axios = require('axios');
const FormData = require('form-data');

const BASE = 'https://graph.facebook.com/v25.0';
const getToken = () => process.env.META_USER_ACCESS_TOKEN;
const getAdAccount = () => process.env.META_AD_ACCOUNT_ID;
const getPageId = () => process.env.META_PAGE_ID;

// Upload image to Meta ad account — returns image hash
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required.' });
    }

    const form = new FormData();
    form.append('access_token', getToken());
    form.append('filename', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/adimages`,
      form,
      { headers: form.getHeaders() }
    );

    const imageHash = Object.values(data.images)[0]?.hash;
    if (!imageHash) {
      return res.status(500).json({ success: false, error: 'Image upload failed — no hash returned.' });
    }

    console.log(`Image uploaded. Hash: ${imageHash}`);
    res.json({ success: true, image_hash: imageHash });
  } catch (err) {
    console.error('Image upload error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

// Create ad creative with image + copy + form attached
exports.createAdCreative = async (req, res) => {
  try {
    const {
      name,
      image_hash,
      message,
      headline,
      description,
      cta_type = 'SIGN_UP',
      lead_gen_form_id,
      link_url,
    } = req.body;

    if (!name || !image_hash || !message || !headline || !lead_gen_form_id) {
      return res.status(400).json({
        success: false,
        error: 'name, image_hash, message, headline, and lead_gen_form_id are required.',
      });
    }

    const objectStorySpec = {
      page_id: getPageId(),
      link_data: {
        image_hash,
        message,
        name: headline,
        description: description || '',
        call_to_action: {
          type: cta_type,
          value: {
            lead_gen_form_id,
            ...(link_url ? { link: link_url } : {}),
          },
        },
      },
    };

    const payload = {
      name,
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: getToken(),
    };

    const { data } = await axios.post(
      `${BASE}/${getAdAccount()}/adcreatives`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log(`Ad Creative "${name}" created with ID: ${data.id}`);
    res.json({ success: true, creative_id: data.id });
  } catch (err) {
    console.error('Ad creative creation error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.getAdCreatives = async (req, res) => {
  try {
    const { data } = await axios.get(
      `${BASE}/${getAdAccount()}/adcreatives`,
      {
        params: {
          access_token: getToken(),
          fields: 'id,name,object_story_spec,status,created_time',
          limit: 100,
        },
      }
    );

    res.json({ success: true, creatives: data.data || [] });
  } catch (err) {
    console.error('Error fetching creatives:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

exports.deleteAdCreative = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, error: 'Creative ID is required.' });

  try {
    await axios.delete(`${BASE}/${id}`, {
      params: { access_token: getToken() },
    });

    res.json({ success: true, deleted_creative_id: id });
  } catch (err) {
    console.error('Creative delete error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

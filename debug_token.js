require('dotenv').config();
const axios = require('axios');

const token = process.env.META_PAGE_ACCESS_TOKEN;

async function debugToken() {
  if (!token) {
    console.error('No token found in .env under META_PAGE_ACCESS_TOKEN');
    return;
  }
  
  console.log('Inspecting token in .env...');
  
  try {
    const { data } = await axios.get(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
    console.log('\n--- Token Debug Info ---');
    console.log('Object Name:', data.name);
    console.log('Object ID:', data.id);
    
    // Page tokens will have a category or other page-specific fields, while user tokens return user fields.
    if (data.id === process.env.META_PAGE_ID) {
      console.log('\nResult: This token is CORRECT and matches your configured Page ID!');
    } else {
      console.log('\nResult: This token is VALID, but does NOT match your META_PAGE_ID.');
      console.log(`Configured Page ID in .env: ${process.env.META_PAGE_ID}`);
      console.log(`Token belongs to ID: ${data.id}`);
      console.log('Action: Please update META_PAGE_ID in your .env to match the Token\'s ID, or generate a token for the correct page.');
    }
  } catch (err) {
    console.log('\n--- Token Error Info ---');
    if (err.response) {
      console.error('Meta API Error:', err.response.data.error.message);
      console.error('Error Type:', err.response.data.error.type);
    } else {
      console.error('Error calling Meta API:', err.message);
    }
  }
}

debugToken();

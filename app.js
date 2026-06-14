require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const webhookRoutes = require('./src/routes/webhook');
const formRoutes = require('./src/routes/forms');
const leadsRoutes = require('./src/routes/leads');

const app = express();

// Configure CORS - Fallback to wildcard or localhost ports if FRONTEND_URL is not configured
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'VOXA Meta Integration API',
    timestamp: new Date().toISOString()
  });
});

// Temporary debug endpoint — remove after token is confirmed
app.get('/debug/token', (req, res) => {
  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  res.json({
    token_prefix: token.slice(0, 20),
    token_suffix: token.slice(-10),
    token_length: token.length
  });
});

// Route registration
app.use('/webhook', webhookRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/leads', leadsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[VOXA Meta Backend] Running on port ${PORT}`);
  console.log(`[VOXA Meta Backend] CORS allowed origins:`, allowedOrigins);
});

module.exports = app;

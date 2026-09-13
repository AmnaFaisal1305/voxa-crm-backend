require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const webhookRoutes = require('./src/routes/webhook');
const formRoutes = require('./src/routes/forms');
const leadsRoutes = require('./src/routes/leads');
const messagesRoutes = require('./src/routes/messages');
const campaignRoutes    = require('./src/routes/campaigns');
const adSetRoutes       = require('./src/routes/adSets');
const adCreativeRoutes  = require('./src/routes/adCreatives');
const adRoutes          = require('./src/routes/ads');

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

// Route registration
app.use('/webhook', webhookRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/adsets', adSetRoutes);
app.use('/api/adcreatives', adCreativeRoutes);
app.use('/api/ads', adRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[VOXA Meta Backend] Running on port ${PORT}`);
  console.log(`[VOXA Meta Backend] CORS allowed origins:`, allowedOrigins);
});

module.exports = app;

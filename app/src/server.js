/**
 * Bedrock Sentinel App - Main Server
 * 
 * Node.js application integrated with Bedrock Sentinel cost governance
 * All Bedrock calls route through the governance proxy for cost tracking
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

// Import route handlers
const bedrockRoutes = require('./routes/bedrock');
const governanceRoutes = require('./routes/governance');
const dashboardRoutes = require('./routes/dashboard');
const healthRoutes = require('./routes/health');

// Initialize Express app
const app = express();

// Middleware
// Configure helmet with relaxed CSP for dashboard UI inline scripts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://"],
      fontSrc: ["'self'"],
    },
  },
}));
app.use(compression()); // Gzip compression
app.use(morgan('combined')); // Logging
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); // CORS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Static files
app.use(express.static('public'));

// API Routes
app.use('/api/bedrock', bedrockRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/admin', require('./routes/admin'));

// Root endpoint - serve dashboard or API info based on Accept header
app.get('/', (req, res) => {
  // If browser requesting HTML, serve index.html (static middleware will handle this)
  // If API client, return JSON
  if (req.accepts('html')) {
    return res.sendFile(__dirname + '/../public/index.html');
  }
  
  res.json({
    service: 'Bedrock Sentinel App',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      bedrock: '/api/bedrock',
      governance: '/api/governance',
      dashboard: '/api/dashboard',
      health: '/api/health',
      dashboard_ui: '/'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    message: 'This endpoint does not exist'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[${req.id}] Error:`, err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 BEDROCK SENTINEL APP STARTED                   ║
╠════════════════════════════════════════════════════════════════╣
║ Environment:         ${process.env.NODE_ENV || 'development'}
║ Port:                ${PORT}
║ Governance API:      ${process.env.GOVERNANCE_API}
║ AWS Region:          ${process.env.AWS_REGION}
║ Account:             ${process.env.ACCOUNT_ID}
╠════════════════════════════════════════════════════════════════╣
║ Available Endpoints:
║ • GET  /                         - Service info
║ • GET  /                         - Dashboard UI
║ • POST /api/bedrock/invoke       - Invoke Bedrock model
║ • POST /api/bedrock/chat         - Chat interface
║ • GET  /api/governance/spending  - Current spending
║ • GET  /api/dashboard/metrics    - Dashboard metrics
║ • GET  /api/health/status        - Health check
╚════════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;

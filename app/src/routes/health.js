const express = require('express');
const router = express.Router();
const logger = require('../utils/logger')('HealthRoutes');

router.get('/status', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'bedrock-sentinel-app',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/readiness', async (req, res) => {
  try {
    const axios = require('axios');
    const governanceApi = process.env.GOVERNANCE_API;
    
    await axios.get(`${governanceApi}/governance/spending`, { timeout: 5000 });
    
    res.json({
      ready: true,
      service: 'bedrock-sentinel-app',
      checks: {
        governanceApi: 'connected',
        server: 'operational'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.warn('Readiness check failed', { error: error.message });
    res.status(503).json({
      ready: false,
      service: 'bedrock-sentinel-app',
      checks: {
        governanceApi: 'unreachable',
        server: 'operational'
      },
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/live', (req, res) => {
  res.json({
    alive: true,
    service: 'bedrock-sentinel-app',
    timestamp: new Date().toISOString()
  });
});

router.get('/detailed', (req, res) => {
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    service: 'bedrock-sentinel-app',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
    },
    uptime: {
      seconds: Math.round(process.uptime()),
      readable: formatUptime(process.uptime())
    },
    timestamp: new Date().toISOString()
  });
});

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

module.exports = router;

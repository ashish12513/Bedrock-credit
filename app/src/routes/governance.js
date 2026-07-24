const express = require('express');
const router = express.Router();
const BedrockClient = require('../utils/bedrock-client');
const logger = require('../utils/logger')('GovernanceRoutes');

const client = new BedrockClient();

router.get('/spending', async (req, res) => {
  try {
    logger.info('Fetching spending status');
    const spending = await client.getSpendingStatus();
    res.json({
      success: true,
      data: spending,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get spending', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve spending data',
      message: error.message
    });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    logger.info('Fetching recommendations');
    const recommendations = await client.getRecommendations();
    res.json({
      success: true,
      data: recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get recommendations', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve recommendations',
      message: error.message
    });
  }
});

router.get('/guardrails', async (req, res) => {
  try {
    logger.info('Fetching guardrails');
    const guardrails = await client.getGuardrails();
    res.json({
      success: true,
      data: guardrails,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get guardrails', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve guardrails',
      message: error.message
    });
  }
});

router.get('/summary', async (req, res) => {
  try {
    logger.info('Fetching summary');
    const summary = await client.getSummary();
    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get summary', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve summary',
      message: error.message
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    logger.info('Fetching full governance status');
    const [spending, recommendations, guardrails, summary] = await Promise.all([
      client.getSpendingStatus(),
      client.getRecommendations(),
      client.getGuardrails(),
      client.getSummary()
    ]);
    
    res.json({
      success: true,
      data: { spending, recommendations, guardrails, summary },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get governance status', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve governance status',
      message: error.message
    });
  }
});

module.exports = router;

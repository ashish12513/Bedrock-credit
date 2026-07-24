/**
 * Admin Routes - Central governance control plane
 * Manage quotas, models, accounts, and access across the organization
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger')('AdminRoutes');

// Mock for now - in production, integrate with DynamoDB and MultiAccountManager
const quotas = new Map();
const modelAccess = new Map();

/**
 * GET /admin/accounts - List all member accounts
 */
router.get('/accounts', async (req, res) => {
  try {
    logger.info('Fetching member accounts');
    
    const accounts = [
      { id: '737185589565', name: 'production-main', status: 'active', usage: { monthly: 3.94, limit: 10000 } },
      { id: '123456789012', name: 'staging-dev', status: 'active', usage: { monthly: 1.23, limit: 2000 } },
      { id: '987654321098', name: 'testing-qa', status: 'active', usage: { monthly: 0.50, limit: 500 } }
    ];

    res.json({
      success: true,
      data: {
        accounts,
        total: accounts.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch accounts', { error: error.message });
    res.json({
      success: true,
      data: { accounts: [], total: 0 },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /admin/quotas - Get quota configuration
 */
router.get('/quotas', async (req, res) => {
  try {
    logger.info('Fetching quotas');
    
    const quotas = {
      'production-main': {
        monthlyLimit: 10000,
        dailyLimit: 500,
        alerts: [80, 90, 100]
      },
      'staging-dev': {
        monthlyLimit: 2000,
        dailyLimit: 100,
        alerts: [80, 90, 100]
      },
      'testing-qa': {
        monthlyLimit: 500,
        dailyLimit: 50,
        alerts: [80, 90, 100]
      }
    };

    res.json({
      success: true,
      data: quotas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch quotas', { error: error.message });
    res.json({ success: true, data: {}, timestamp: new Date().toISOString() });
  }
});

/**
 * POST /admin/quotas - Set quota for account
 */
router.post('/quotas', async (req, res) => {
  try {
    const { accountId, monthlyLimit, dailyLimit, alerts } = req.body;

    if (!accountId || !monthlyLimit || !dailyLimit) {
      return res.status(400).json({
        error: 'Missing required fields: accountId, monthlyLimit, dailyLimit'
      });
    }

    logger.info('Setting quota', { accountId, monthlyLimit, dailyLimit });

    // Store in DynamoDB (mock for now)
    quotas.set(accountId, { monthlyLimit, dailyLimit, alerts: alerts || [80, 90, 100] });

    res.json({
      success: true,
      data: { accountId, monthlyLimit, dailyLimit },
      message: `Quota set for account ${accountId}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to set quota', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/models - List all models and their access status
 */
router.get('/models', async (req, res) => {
  try {
    logger.info('Fetching models');
    
    const models = [
      {
        id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        accessStatus: { 'production-main': true, 'staging-dev': true, 'testing-qa': false },
        monthlyLimit: { 'production-main': 5000, 'staging-dev': 1000 }
      },
      {
        id: 'anthropic.claude-3-opus-20250219-v1:0',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        accessStatus: { 'production-main': true, 'staging-dev': false, 'testing-qa': false },
        monthlyLimit: { 'production-main': 2000 }
      },
      {
        id: 'anthropic.claude-3-haiku-20250307-v1:0',
        name: 'Claude 3 Haiku',
        provider: 'Anthropic',
        accessStatus: { 'production-main': true, 'staging-dev': true, 'testing-qa': true },
        monthlyLimit: { 'production-main': 3000, 'staging-dev': 1000, 'testing-qa': 500 }
      }
    ];

    res.json({
      success: true,
      data: { models, total: models.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch models', { error: error.message });
    res.json({ success: true, data: { models: [], total: 0 }, timestamp: new Date().toISOString() });
  }
});

/**
 * POST /admin/models/:modelId/enable - Enable model for account
 */
router.post('/models/:modelId/enable', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    logger.info('Enabling model', { modelId, accountId });

    // Update model access (mock)
    modelAccess.set(`${accountId}:${modelId}`, true);

    res.json({
      success: true,
      message: `Model ${modelId} enabled for account ${accountId}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to enable model', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/models/:modelId/disable - Disable model for account
 */
router.post('/models/:modelId/disable', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    logger.info('Disabling model', { modelId, accountId });

    // Update model access (mock)
    modelAccess.set(`${accountId}:${modelId}`, false);

    res.json({
      success: true,
      message: `Model ${modelId} disabled for account ${accountId}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to disable model', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/usage - Get organization-wide usage
 */
router.get('/usage', async (req, res) => {
  try {
    logger.info('Fetching organization usage');
    
    const usage = {
      totalMonthlySpend: 5.67,
      totalDailySpend: 0.35,
      accountBreakdown: [
        { account: 'production-main', monthly: 3.94, daily: 0.20, alerts: [] },
        { account: 'staging-dev', monthly: 1.23, daily: 0.10, alerts: [] },
        { account: 'testing-qa', monthly: 0.50, daily: 0.05, alerts: [] }
      ],
      modelBreakdown: [
        { model: 'Claude Sonnet', monthly: 3.50, invocations: 15 },
        { model: 'Claude Opus', monthly: 1.20, invocations: 5 },
        { model: 'Claude Haiku', monthly: 0.97, invocations: 8 }
      ],
      forecast: { monthlyProjected: 170.10 }
    };

    res.json({
      success: true,
      data: usage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch usage', { error: error.message });
    res.json({ success: true, data: {}, timestamp: new Date().toISOString() });
  }
});

/**
 * GET /admin/alerts - Get active alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    logger.info('Fetching alerts');
    
    const alerts = [
      {
        id: 'alert-001',
        account: 'production-main',
        type: 'quota_warning',
        level: 85,
        message: 'Production account at 85% of monthly quota',
        created: new Date(Date.now() - 3600000).toISOString()
      }
    ];

    res.json({
      success: true,
      data: { alerts, total: alerts.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch alerts', { error: error.message });
    res.json({ success: true, data: { alerts: [], total: 0 }, timestamp: new Date().toISOString() });
  }
});

/**
 * POST /admin/alerts/:alertId/acknowledge - Acknowledge alert
 */
router.post('/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    logger.info('Acknowledging alert', { alertId });

    res.json({
      success: true,
      message: `Alert ${alertId} acknowledged`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to acknowledge alert', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

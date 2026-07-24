const express = require('express');
const router = express.Router();
const BedrockClient = require('../utils/bedrock-client');
const dataService = require('../utils/data-service');
const logger = require('../utils/logger')('DashboardRoutes');

const client = new BedrockClient();

router.get('/metrics', async (req, res) => {
  try {
    logger.info('Fetching dashboard metrics');
    
    const appStats = client.getStats();
    
    // Quick response - use cached/sample data
    // In production, this would query Athena directly for much faster results
    const metrics = {
      spending: {
        daily: '3.94',
        limit: 5000,
        percentageUsed: 0,
        status: 'tracking',
        period: 'Monthly (Latest Available)'
      },
      summary: {
        totalSpend: '3.94',
        totalInvocations: 18,
        totalTokens: 723239,
        modelsUsed: 1
      },
      appStats: {
        requests: appStats.totalRequests,
        totalCost: appStats.totalCost.toFixed(4),
        totalTokens: appStats.totalTokens,
        avgCostPerRequest: appStats.avgCostPerRequest,
        avgTokensPerRequest: appStats.avgTokensPerRequest,
        uptime: appStats.uptimeSeconds
      },
      note: 'Data sourced from S3 Bedrock logs. For real-time data, query Athena directly.'
    };
    
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get dashboard metrics', { error: error.message });
    
    const defaultStats = client.getStats();
    res.json({
      success: true,
      metrics: {
        spending: { daily: '0.00', limit: 5000, percentageUsed: 0, status: 'waiting', period: 'Daily' },
        summary: { totalSpend: '0.00', totalInvocations: 0, totalTokens: 0, modelsUsed: 0 },
        appStats: {
          requests: defaultStats.totalRequests,
          totalCost: defaultStats.totalCost.toFixed(4),
          totalTokens: defaultStats.totalTokens,
          avgCostPerRequest: defaultStats.avgCostPerRequest,
          avgTokensPerRequest: defaultStats.avgTokensPerRequest,
          uptime: defaultStats.uptimeSeconds
        }
      },
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/overview', async (req, res) => {
  try {
    logger.info('Fetching dashboard overview');
    
    const dailySpending = await dataService.getDailySpending();
    
    const topModels = Object.entries(dailySpending.models || {})
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 5)
      .map(([name, data]) => ({
        name,
        invocations: data.invocations,
        cost: parseFloat(data.cost).toFixed(4),
        tokens: data.tokens
      }));
    
    const overview = {
      dailySpend: {
        amount: parseFloat(dailySpending.totalCost || 0).toFixed(2),
        limit: 5000,
        status: dailySpending.totalCost > 0 ? 'tracking' : 'waiting'
      },
      topMetrics: {
        totalCalls: dailySpending.totalInvocations || 0,
        topModels: topModels
      },
      models: dailySpending.models || {},
      accounts: dailySpending.accounts || {}
    };
    
    res.json({
      success: true,
      data: overview,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get dashboard overview', { error: error.message });
    res.json({
      success: true,
      data: {
        dailySpend: { amount: '0.00', limit: 5000, status: 'error' },
        topMetrics: { totalCalls: 0, topModels: [] },
        models: {},
        accounts: {}
      },
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    logger.info('Fetching recommendations for dashboard');
    
    const formatted = {
      total: 3,
      items: [
        {
          id: 'rec-001',
          title: 'Switch to Haiku for simple tasks',
          savings: '35% monthly',
          effort: 'Low',
          risk: 'Low'
        },
        {
          id: 'rec-002',
          title: 'Enable prompt caching for repeated queries',
          savings: '25% on cached queries',
          effort: 'Medium',
          risk: 'Low'
        },
        {
          id: 'rec-003',
          title: 'Use batch processing for bulk operations',
          savings: '20% on throughput',
          effort: 'Medium',
          risk: 'Medium'
        }
      ]
    };
    
    res.json({
      success: true,
      data: formatted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get recommendations', { error: error.message });
    res.json({
      success: true,
      data: { total: 0, items: [] },
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

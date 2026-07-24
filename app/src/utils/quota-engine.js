/**
 * Quota Engine - Central enforcement for Bedrock spending limits
 * Manages per-account, per-model, per-user quotas
 */

const logger = require('./logger')('QuotaEngine');

class QuotaEngine {
  
  constructor(dynamoDBClient) {
    this.dynamoDB = dynamoDBClient;
    this.TABLE = 'bedrock-spending-limits';
    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute
  }

  /**
   * Check if a request should be allowed based on quotas
   */
  async checkQuota(request) {
    const {
      accountId,
      modelId,
      userId,
      tokens,
      estimatedCost
    } = request;

    try {
      logger.info('Checking quota', { accountId, modelId, userId });

      // 1. Check model access
      const modelAllowed = await this.isModelAllowed(accountId, modelId);
      if (!modelAllowed) {
        return {
          allowed: false,
          reason: `Model ${modelId} is not enabled for account ${accountId}`,
          quotaExceeded: false
        };
      }

      // 2. Check account quota
      const accountQuota = await this.getAccountQuota(accountId);
      const accountUsage = await this.getAccountUsage(accountId);
      
      if (accountUsage.monthlyCost + estimatedCost > accountQuota.monthlyLimit) {
        return {
          allowed: false,
          reason: `Account quota exceeded. Remaining: $${(accountQuota.monthlyLimit - accountUsage.monthlyCost).toFixed(2)}`,
          quotaExceeded: true,
          remaining: accountQuota.monthlyLimit - accountUsage.monthlyCost
        };
      }

      // 3. Check model quota
      const modelQuota = await this.getModelQuota(accountId, modelId);
      const modelUsage = await this.getModelUsage(accountId, modelId);
      
      if (modelUsage.monthlyCost + estimatedCost > modelQuota.monthlyLimit) {
        return {
          allowed: false,
          reason: `Model quota exceeded for ${modelId}. Remaining: $${(modelQuota.monthlyLimit - modelUsage.monthlyCost).toFixed(2)}`,
          quotaExceeded: true,
          remaining: modelQuota.monthlyLimit - modelUsage.monthlyCost
        };
      }

      // 4. Check daily limit
      const dailyUsage = await this.getDailyUsage(accountId);
      if (dailyUsage.cost + estimatedCost > accountQuota.dailyLimit) {
        return {
          allowed: false,
          reason: `Daily quota exceeded. Remaining: $${(accountQuota.dailyLimit - dailyUsage.cost).toFixed(2)}`,
          quotaExceeded: true,
          remaining: accountQuota.dailyLimit - dailyUsage.cost
        };
      }

      // All checks passed
      return {
        allowed: true,
        reason: 'All quotas within limits',
        remaining: {
          monthlyAccount: accountQuota.monthlyLimit - accountUsage.monthlyCost,
          dailyAccount: accountQuota.dailyLimit - dailyUsage.cost,
          monthlyModel: modelQuota.monthlyLimit - modelUsage.monthlyCost
        }
      };

    } catch (error) {
      logger.error('Quota check failed', { error: error.message });
      // Default to allowing if we can't check (fail open)
      return {
        allowed: true,
        reason: 'Quota check unavailable - allowing request',
        error: error.message
      };
    }
  }

  /**
   * Check if a model is enabled for an account
   */
  async isModelAllowed(accountId, modelId) {
    try {
      const cacheKey = `model-allowed:${accountId}:${modelId}`;
      const cached = this.getCache(cacheKey);
      if (cached !== undefined) return cached;

      // Query DynamoDB for model access
      const params = {
        TableName: this.TABLE,
        Key: {
          accountId,
          type: `MODEL#${modelId}`
        }
      };

      const result = await this.dynamoDB.get(params).promise();
      const allowed = result.Item ? result.Item.enabled === true : true; // Default to enabled

      this.setCache(cacheKey, allowed);
      return allowed;
    } catch (error) {
      logger.error('Failed to check model access', { error: error.message });
      return true; // Default to allowed if check fails
    }
  }

  /**
   * Get account quota
   */
  async getAccountQuota(accountId) {
    try {
      const cacheKey = `quota:${accountId}`;
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const params = {
        TableName: this.TABLE,
        Key: {
          accountId,
          type: 'ACCOUNT_QUOTA'
        }
      };

      const result = await this.dynamoDB.get(params).promise();
      const quota = result.Item || {
        monthlyLimit: 10000,
        dailyLimit: 500,
        alerts: [80, 90, 100]
      };

      this.setCache(cacheKey, quota);
      return quota;
    } catch (error) {
      logger.error('Failed to get account quota', { error: error.message });
      return { monthlyLimit: 10000, dailyLimit: 500 };
    }
  }

  /**
   * Get model quota
   */
  async getModelQuota(accountId, modelId) {
    try {
      const cacheKey = `model-quota:${accountId}:${modelId}`;
      const cached = this.getCache(cacheKey);
      if (cached) return cached;

      const params = {
        TableName: this.TABLE,
        Key: {
          accountId,
          type: `MODEL_QUOTA#${modelId}`
        }
      };

      const result = await this.dynamoDB.get(params).promise();
      const quota = result.Item || {
        monthlyLimit: 5000,
        dailyLimit: 300
      };

      this.setCache(cacheKey, quota);
      return quota;
    } catch (error) {
      logger.error('Failed to get model quota', { error: error.message });
      return { monthlyLimit: 5000, dailyLimit: 300 };
    }
  }

  /**
   * Get account usage for current month
   */
  async getAccountUsage(accountId) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Query CloudWatch metrics or DynamoDB usage table
      // For now, return 0 (would query from DynamoDB usage table)
      return {
        monthlyCost: 0,
        monthlyTokens: 0,
        invocations: 0
      };
    } catch (error) {
      logger.error('Failed to get account usage', { error: error.message });
      return { monthlyCost: 0, monthlyTokens: 0, invocations: 0 };
    }
  }

  /**
   * Get model usage
   */
  async getModelUsage(accountId, modelId) {
    try {
      return {
        monthlyCost: 0,
        monthlyTokens: 0,
        invocations: 0
      };
    } catch (error) {
      logger.error('Failed to get model usage', { error: error.message });
      return { monthlyCost: 0, monthlyTokens: 0, invocations: 0 };
    }
  }

  /**
   * Get daily usage
   */
  async getDailyUsage(accountId) {
    try {
      return {
        cost: 0,
        tokens: 0,
        invocations: 0
      };
    } catch (error) {
      logger.error('Failed to get daily usage', { error: error.message });
      return { cost: 0, tokens: 0, invocations: 0 };
    }
  }

  /**
   * Set quotas for account
   */
  async setAccountQuota(accountId, quota) {
    try {
      logger.info('Setting account quota', { accountId, quota });

      const params = {
        TableName: this.TABLE,
        Item: {
          accountId,
          type: 'ACCOUNT_QUOTA',
          monthlyLimit: quota.monthlyLimit,
          dailyLimit: quota.dailyLimit,
          alerts: quota.alerts || [80, 90, 100],
          updatedAt: new Date().toISOString()
        }
      };

      await this.dynamoDB.put(params).promise();
      
      // Invalidate cache
      this.cache.delete(`quota:${accountId}`);
      
      logger.info('Account quota set successfully');
      return true;
    } catch (error) {
      logger.error('Failed to set account quota', { error: error.message });
      throw error;
    }
  }

  /**
   * Enable/disable model
   */
  async setModelAccess(accountId, modelId, enabled) {
    try {
      logger.info('Setting model access', { accountId, modelId, enabled });

      const params = {
        TableName: this.TABLE,
        Item: {
          accountId,
          type: `MODEL#${modelId}`,
          modelId,
          enabled,
          updatedAt: new Date().toISOString()
        }
      };

      await this.dynamoDB.put(params).promise();
      
      // Invalidate cache
      this.cache.delete(`model-allowed:${accountId}:${modelId}`);
      
      logger.info('Model access updated');
      return true;
    } catch (error) {
      logger.error('Failed to set model access', { error: error.message });
      throw error;
    }
  }

  /**
   * Cache helpers
   */
  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.time > this.cacheTTL) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }

  setCache(key, value) {
    this.cache.set(key, { value, time: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = QuotaEngine;

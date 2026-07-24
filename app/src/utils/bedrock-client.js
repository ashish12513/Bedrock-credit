/**
 * Bedrock Client - Wrapper around Bedrock Sentinel Governance API
 */

const axios = require('axios');
const logger = require('./logger')('BedrockClient');

class BedrockClient {
  constructor(config = {}) {
    this.proxyEndpoint = config.proxyEndpoint || process.env.BEDROCK_PROXY_ENDPOINT;
    this.governanceApi = config.governanceApi || process.env.GOVERNANCE_API;
    this.accountId = config.accountId || process.env.ACCOUNT_ID || 'production-main';
    this.defaultQuality = config.defaultQuality || process.env.DEFAULT_QUALITY || 'balanced';
    this.defaultTaskType = config.defaultTaskType || process.env.DEFAULT_TASK_TYPE || 'default';
    this.defaultMaxTokens = config.defaultMaxTokens || parseInt(process.env.DEFAULT_MAX_TOKENS) || 1024;
    
    this.stats = {
      totalRequests: 0,
      totalCost: 0,
      totalTokens: 0,
      startTime: new Date()
    };

    logger.info('BedrockClient initialized', {
      proxyEndpoint: this.proxyEndpoint,
      accountId: this.accountId
    });
  }

  async invokeModel(params) {
    const {
      modelId,
      messages,
      taskType = this.defaultTaskType,
      quality = this.defaultQuality,
      maxTokens = this.defaultMaxTokens,
      enableCaching = true
    } = params;

    if (!modelId || !messages) {
      throw new Error('modelId and messages are required');
    }

    const requestPayload = {
      modelId,
      messages,
      accountId: this.accountId,
      taskType,
      qualityLevel: quality,
      maxTokens,
      enableCaching
    };

    try {
      logger.debug('Invoking model through governance proxy', {
        modelId,
        taskType,
        quality,
        maxTokens
      });

      const response = await axios.post(
        this.proxyEndpoint,
        requestPayload,
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;

      this.stats.totalRequests++;
      const cost = result.cost_info?.estimated_cost || 0;
      this.stats.totalCost += cost;
      const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);
      this.stats.totalTokens += tokens;

      logger.info('Model invocation successful', {
        modelId,
        cost: cost.toFixed(6),
        tokens,
        optimizations: result.optimizations_applied || []
      });

      return result;
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Cost limit exceeded, attempting fallback', {
          modelId,
          currentCost: this.stats.totalCost.toFixed(2)
        });
        return this._fallbackToCheeperModel(messages, taskType, maxTokens);
      }

      logger.error('Model invocation failed', {
        modelId,
        status: error.response?.status,
        error: error.message
      });

      throw error;
    }
  }

  async _fallbackToCheeperModel(messages, taskType, maxTokens) {
    const cheaperModels = {
      classification: 'anthropic.claude-3-haiku-20250307-v1:0',
      summarization: 'anthropic.claude-3-haiku-20250307-v1:0',
      default: 'anthropic.claude-3-haiku-20250307-v1:0'
    };

    const cheaperModel = cheaperModels[taskType] || cheaperModels.default;

    return this.invokeModel({
      modelId: cheaperModel,
      messages,
      taskType,
      quality: 'cheap',
      maxTokens,
      enableCaching: true
    });
  }

  async getSpendingStatus() {
    try {
      const response = await axios.get(`${this.governanceApi}/governance/spending`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get spending status', { error: error.message });
      throw error;
    }
  }

  async getRecommendations() {
    try {
      const response = await axios.get(`${this.governanceApi}/governance/recommendations`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get recommendations', { error: error.message });
      throw error;
    }
  }

  async getGuardrails() {
    try {
      const response = await axios.get(`${this.governanceApi}/governance/guardrails`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get guardrails', { error: error.message });
      throw error;
    }
  }

  async getSummary() {
    try {
      const response = await axios.get(`${this.governanceApi}/governance/summary`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get summary', { error: error.message });
      throw error;
    }
  }

  getStats() {
    const uptime = (new Date() - this.stats.startTime) / 1000;
    return {
      ...this.stats,
      uptimeSeconds: Math.round(uptime),
      avgCostPerRequest: this.stats.totalRequests > 0 
        ? (this.stats.totalCost / this.stats.totalRequests).toFixed(6)
        : 0,
      avgTokensPerRequest: this.stats.totalRequests > 0
        ? Math.round(this.stats.totalTokens / this.stats.totalRequests)
        : 0
    };
  }
}

module.exports = BedrockClient;

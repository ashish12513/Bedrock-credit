/**
 * AWS Bedrock Real Client - Direct integration with Amazon Bedrock
 * Replaces the proxy with actual AWS Bedrock API calls
 */

const {
  BedrockClient: AwsBedrockClient,
  InvokeModelCommand
} = require('@aws-sdk/client-bedrock-runtime');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const logger = require('./logger')('AWSBedrockClient');

class AWSBedrockRealClient {
  constructor(config = {}) {
    this.accountId = config.accountId || process.env.ACCOUNT_ID || 'default';
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.roleArn = config.roleArn || process.env.CROSS_ACCOUNT_ROLE_ARN;
    this.externalId = config.externalId || process.env.CROSS_ACCOUNT_EXTERNAL_ID;
    
    // Initialize Bedrock client for current account
    this.bedrockClient = new AwsBedrockClient({ region: this.region });
    this.stsClient = new STSClient({ region: this.region });
    
    // Cost tracking (Claude 3.5 Sonnet pricing)
    this.pricing = {
      'anthropic.claude-3-5-sonnet-20241022-v2:0': {
        inputPer1KTokens: 0.003,
        outputPer1KTokens: 0.015
      },
      'anthropic.claude-3-opus-20250219-v1:0': {
        inputPer1KTokens: 0.015,
        outputPer1KTokens: 0.075
      },
      'anthropic.claude-3-haiku-20250307-v1:0': {
        inputPer1KTokens: 0.00080,
        outputPer1KTokens: 0.0040
      }
    };

    this.stats = {
      totalRequests: 0,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startTime: new Date()
    };

    logger.info('AWSBedrockRealClient initialized', {
      accountId: this.accountId,
      region: this.region,
      crossAccountRole: !!this.roleArn
    });
  }

  /**
   * Assume role in another AWS account for multi-account access
   */
  async getCredentialsForAccount(accountId) {
    if (accountId === 'default' || !this.roleArn) {
      return null; // Use default credentials
    }

    try {
      const roleArn = this.roleArn.replace('ACCOUNT_ID', accountId);
      
      const assumeRoleCommand = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `bedrock-sentinel-${accountId}-${Date.now()}`,
        ExternalId: this.externalId,
        DurationSeconds: 3600
      });

      const response = await this.stsClient.send(assumeRoleCommand);
      
      logger.info('Successfully assumed role', {
        accountId,
        roleArn,
        sessionName: assumeRoleCommand.input.RoleSessionName
      });

      return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken
      };
    } catch (error) {
      logger.error('Failed to assume role', {
        accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate estimated cost based on tokens used
   */
  calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = this.pricing[modelId];
    if (!pricing) {
      logger.warn('Unknown model pricing', { modelId });
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.inputPer1KTokens;
    const outputCost = (outputTokens / 1000) * pricing.outputPer1KTokens;
    return inputCost + outputCost;
  }

  /**
   * Invoke model through real AWS Bedrock
   */
  async invokeModel(params) {
    const {
      modelId,
      messages,
      maxTokens = 1024,
      temperature = 0.7,
      accountId = 'default'
    } = params;

    if (!modelId || !messages) {
      throw new Error('modelId and messages are required');
    }

    try {
      logger.debug('Invoking real Bedrock model', {
        modelId,
        messageCount: messages.length,
        accountId
      });

      // Get credentials for the target account if cross-account
      let credentials = null;
      if (accountId !== 'default') {
        credentials = await this.getCredentialsForAccount(accountId);
      }

      // Create Bedrock client with appropriate credentials
      const bedrockClient = credentials
        ? new AwsBedrockClient({
            region: this.region,
            credentials
          })
        : this.bedrockClient;

      // Prepare the request payload
      const requestPayload = {
        model: modelId,
        max_tokens: maxTokens,
        system: 'You are Claude, an AI assistant created by Anthropic. You provide helpful, harmless, and honest responses. All your responses are being tracked through the Bedrock Sentinel cost governance system.',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature
      };

      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestPayload)
      });

      const response = await bedrockClient.send(command);
      
      // Parse the response
      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      const outputText = responseBody.content?.[0]?.text || '';
      const inputTokens = responseBody.usage?.input_tokens || 0;
      const outputTokens = responseBody.usage?.output_tokens || 0;
      const estimatedCost = this.calculateCost(modelId, inputTokens, outputTokens);

      // Update stats
      this.stats.totalRequests++;
      this.stats.totalCost += estimatedCost;
      this.stats.totalInputTokens += inputTokens;
      this.stats.totalOutputTokens += outputTokens;

      logger.info('Model invocation successful', {
        modelId,
        accountId,
        inputTokens,
        outputTokens,
        estimatedCost: estimatedCost.toFixed(6)
      });

      return {
        success: true,
        content: outputText,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        },
        cost_info: {
          estimated_cost: estimatedCost,
          model: modelId
        }
      };
    } catch (error) {
      logger.error('Real Bedrock invocation failed', {
        modelId,
        accountId,
        error: error.message,
        code: error.code
      });

      throw error;
    }
  }

  /**
   * Chat endpoint using real Bedrock
   */
  async chat(message, conversationHistory = [], accountId = 'default') {
    try {
      const messages = [
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      const result = await this.invokeModel({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        messages,
        maxTokens: 1024,
        accountId
      });

      return result;
    } catch (error) {
      logger.error('Chat failed', {
        error: error.message,
        accountId
      });
      throw error;
    }
  }

  /**
   * Get stats
   */
  getStats() {
    const uptime = (new Date() - this.stats.startTime) / 1000;
    return {
      ...this.stats,
      uptimeSeconds: Math.round(uptime),
      avgCostPerRequest: this.stats.totalRequests > 0
        ? (this.stats.totalCost / this.stats.totalRequests).toFixed(6)
        : 0,
      totalTokens: this.stats.totalInputTokens + this.stats.totalOutputTokens,
      avgTokensPerRequest: this.stats.totalRequests > 0
        ? Math.round((this.stats.totalInputTokens + this.stats.totalOutputTokens) / this.stats.totalRequests)
        : 0
    };
  }
}

module.exports = AWSBedrockRealClient;

/**
 * Multi-Account Manager - Cross-account Bedrock governance
 * Manages access to multiple AWS accounts via AssumeRole
 */

const AWS = require('aws-sdk');
const logger = require('./logger')('MultiAccountManager');

class MultiAccountManager {
  
  constructor(config = {}) {
    this.primaryAccount = config.primaryAccount || process.env.AWS_ACCOUNT_ID;
    this.primaryRegion = config.primaryRegion || process.env.AWS_REGION || 'us-east-1';
    this.roleSessionDuration = 3600; // 1 hour
    this.assumedRoles = new Map();
  }

  /**
   * Get STS client for assuming roles
   */
  getSTS() {
    return new AWS.STS({ region: this.primaryRegion });
  }

  /**
   * Assume role in member account
   */
  async assumeRoleInAccount(memberAccountId, roleName = 'BedrockGovernanceRole') {
    try {
      const cacheKey = `${memberAccountId}:${roleName}`;
      
      // Check if we already have active credentials
      if (this.assumedRoles.has(cacheKey)) {
        const cached = this.assumedRoles.get(cacheKey);
        if (Date.now() < cached.expiration - 300000) { // Refresh 5 min before expiry
          logger.debug('Using cached assumed role credentials', { memberAccountId });
          return cached.credentials;
        }
      }

      logger.info('Assuming role in member account', { memberAccountId });

      const sts = this.getSTS();
      const roleArn = `arn:aws:iam::${memberAccountId}:role/${roleName}`;
      
      const params = {
        RoleArn: roleArn,
        RoleSessionName: `bedrock-governance-${Date.now()}`,
        DurationSeconds: this.roleSessionDuration
      };

      const response = await sts.assumeRole(params).promise();
      const credentials = response.Credentials;

      // Cache the credentials
      this.assumedRoles.set(cacheKey, {
        credentials,
        expiration: new Date(credentials.Expiration).getTime()
      });

      logger.info('Successfully assumed role', { memberAccountId });
      return credentials;

    } catch (error) {
      logger.error('Failed to assume role', { memberAccountId, error: error.message });
      throw error;
    }
  }

  /**
   * Get Bedrock client for member account
   */
  async getBedrockClientForAccount(memberAccountId) {
    try {
      if (memberAccountId === this.primaryAccount) {
        // Use primary account credentials
        return new AWS.BedrockRuntime({ region: this.primaryRegion });
      }

      // Assume role in member account
      const credentials = await this.assumeRoleInAccount(memberAccountId);
      
      return new AWS.BedrockRuntime({
        region: this.primaryRegion,
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken
      });

    } catch (error) {
      logger.error('Failed to get Bedrock client', { memberAccountId, error: error.message });
      throw error;
    }
  }

  /**
   * Get IAM client for member account
   */
  async getIAMClientForAccount(memberAccountId) {
    try {
      if (memberAccountId === this.primaryAccount) {
        return new AWS.IAM();
      }

      const credentials = await this.assumeRoleInAccount(memberAccountId);
      
      return new AWS.IAM({
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken
      });

    } catch (error) {
      logger.error('Failed to get IAM client', { memberAccountId, error: error.message });
      throw error;
    }
  }

  /**
   * List available models in member account
   */
  async listModelsInAccount(memberAccountId) {
    try {
      logger.info('Listing models in account', { memberAccountId });

      const bedrock = await this.getBedrockClientForAccount(memberAccountId);
      const response = await bedrock.listFoundationModels().promise();

      return response.modelSummaries || [];

    } catch (error) {
      logger.error('Failed to list models', { memberAccountId, error: error.message });
      return [];
    }
  }

  /**
   * Enable model access in member account via IAM policy
   */
  async enableModelInAccount(memberAccountId, modelId, roleName = 'BedrockUserRole') {
    try {
      logger.info('Enabling model access', { memberAccountId, modelId });

      const iam = await this.getIAMClientForAccount(memberAccountId);

      // Get current policy
      const policyResponse = await iam.getInlineRolePolicy({
        RoleName: roleName,
        PolicyName: 'BedrockAccess'
      }).promise().catch(() => null);

      const currentPolicy = policyResponse?.RolePolicyDocument ? 
        JSON.parse(decodeURIComponent(policyResponse.RolePolicyDocument)) : 
        {
          Version: '2012-10-17',
          Statement: []
        };

      // Add model to allowed list
      const statement = currentPolicy.Statement.find(s => s.Effect === 'Allow' && s.Action.includes('bedrock:InvokeModel'));
      
      if (statement) {
        if (!statement.Resource.includes(`model/${modelId}`)) {
          statement.Resource.push(`arn:aws:bedrock:*::foundation-model/${modelId}`);
        }
      }

      // Update policy
      await iam.putRolePolicy({
        RoleName: roleName,
        PolicyName: 'BedrockAccess',
        PolicyDocument: JSON.stringify(currentPolicy)
      }).promise();

      logger.info('Model access enabled');
      return true;

    } catch (error) {
      logger.error('Failed to enable model', { memberAccountId, modelId, error: error.message });
      throw error;
    }
  }

  /**
   * Disable model access in member account
   */
  async disableModelInAccount(memberAccountId, modelId, roleName = 'BedrockUserRole') {
    try {
      logger.info('Disabling model access', { memberAccountId, modelId });

      const iam = await this.getIAMClientForAccount(memberAccountId);

      const policyResponse = await iam.getInlineRolePolicy({
        RoleName: roleName,
        PolicyName: 'BedrockAccess'
      }).promise();

      const policy = JSON.parse(decodeURIComponent(policyResponse.RolePolicyDocument));

      // Remove model from allowed list
      const statement = policy.Statement.find(s => s.Effect === 'Allow');
      if (statement && statement.Resource) {
        statement.Resource = statement.Resource.filter(r => !r.includes(modelId));
      }

      await iam.putRolePolicy({
        RoleName: roleName,
        PolicyName: 'BedrockAccess',
        PolicyDocument: JSON.stringify(policy)
      }).promise();

      logger.info('Model access disabled');
      return true;

    } catch (error) {
      logger.error('Failed to disable model', { memberAccountId, modelId, error: error.message });
      throw error;
    }
  }

  /**
   * Get CloudTrail logs from member account
   */
  async getUsageFromAccount(memberAccountId, startTime, endTime) {
    try {
      logger.info('Getting usage from account', { memberAccountId });

      // Would query CloudTrail or Athena for Bedrock invocations
      // For now, return empty
      return {
        invocations: 0,
        totalCost: 0,
        totalTokens: 0
      };

    } catch (error) {
      logger.error('Failed to get usage', { memberAccountId, error: error.message });
      return { invocations: 0, totalCost: 0, totalTokens: 0 };
    }
  }

  /**
   * Clear cached credentials
   */
  clearCredentialCache() {
    this.assumedRoles.clear();
    logger.info('Cleared credential cache');
  }
}

module.exports = MultiAccountManager;

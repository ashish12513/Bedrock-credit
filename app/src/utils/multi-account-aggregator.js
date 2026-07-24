/**
 * Multi-Account Aggregator - Gathers real Bedrock metrics from member accounts
 */

const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const logger = require('./logger')('MultiAccountAggregator');

class MultiAccountAggregator {
  constructor(config = {}) {
    this.mainAccountId = config.mainAccountId || process.env.AWS_ACCOUNT_ID;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.crossAccountRoleArn = config.crossAccountRoleArn || process.env.CROSS_ACCOUNT_ROLE_ARN;
    this.externalId = config.externalId || process.env.CROSS_ACCOUNT_EXTERNAL_ID;

    this.stsClient = new STSClient({ region: this.region });
    this.costExplorerClient = new CostExplorerClient({ region: 'us-east-1' }); // CE is only in us-east-1

    logger.info('MultiAccountAggregator initialized', {
      mainAccountId: this.mainAccountId,
      region: this.region,
      crossAccountEnabled: !!this.crossAccountRoleArn
    });
  }

  /**
   * Assume role in another AWS account
   */
  async assumeRole(accountId) {
    if (accountId === this.mainAccountId) {
      return null; // Use default credentials for main account
    }

    try {
      const roleArn = this.crossAccountRoleArn.replace('ACCOUNT_ID', accountId);

      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `bedrock-sentinel-${accountId}-${Date.now()}`,
        ExternalId: this.externalId,
        DurationSeconds: 3600
      });

      const response = await this.stsClient.send(command);

      logger.info('Successfully assumed role', {
        accountId,
        roleArn
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
   * Get Bedrock costs from Cost Explorer for a specific account
   */
  async getBedrockCostForAccount(accountId, startDate, endDate) {
    try {
      logger.debug('Fetching Bedrock costs', {
        accountId,
        startDate,
        endDate
      });

      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate,
          End: endDate
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
        Filter: {
          And: [
            {
              Dimensions: {
                Key: 'SERVICE',
                Values: ['Amazon Bedrock']
              }
            },
            {
              Dimensions: {
                Key: 'LINKED_ACCOUNT',
                Values: [accountId]
              }
            }
          ]
        },
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'MODEL'
          }
        ]
      });

      const response = await this.costExplorerClient.send(command);

      let totalCost = 0;
      const modelCosts = {};

      if (response.ResultsByTime) {
        response.ResultsByTime.forEach(result => {
          result.Groups.forEach(group => {
            const model = group.Keys[0];
            const cost = parseFloat(group.Metrics.UnblendedCost.Amount);
            totalCost += cost;
            modelCosts[model] = (modelCosts[model] || 0) + cost;
          });
        });
      }

      return {
        accountId,
        totalCost,
        modelCosts,
        period: { startDate, endDate }
      };
    } catch (error) {
      logger.error('Failed to fetch Bedrock costs', {
        accountId,
        error: error.message
      });
      return {
        accountId,
        totalCost: 0,
        modelCosts: {},
        error: error.message
      };
    }
  }

  /**
   * Get metrics from CloudWatch for an account
   */
  async getCloudWatchMetrics(accountId, metricName, startTime, endTime) {
    try {
      let credentials = null;
      if (accountId !== this.mainAccountId) {
        credentials = await this.assumeRole(accountId);
      }

      const cloudWatchClient = new CloudWatchClient({
        region: this.region,
        ...(credentials && { credentials })
      });

      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/Bedrock',
        MetricName: metricName,
        StartTime: new Date(startTime),
        EndTime: new Date(endTime),
        Period: 3600, // 1 hour
        Statistics: ['Sum', 'Average', 'Maximum'],
        Dimensions: [
          {
            Name: 'LinkedAccount',
            Value: accountId
          }
        ]
      });

      const response = await cloudWatchClient.send(command);

      logger.debug('CloudWatch metrics retrieved', {
        accountId,
        metricName,
        datapoints: response.Datapoints?.length || 0
      });

      return response.Datapoints || [];
    } catch (error) {
      logger.error('Failed to get CloudWatch metrics', {
        accountId,
        metricName,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get aggregated metrics across all accounts
   */
  async getOrganizationMetrics(accounts, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]; // Add 1 day for inclusive range

      logger.info('Fetching organization metrics', {
        accountCount: accounts.length,
        startDate: startDateStr,
        endDate: endDateStr
      });

      const results = {};
      let totalCost = 0;
      let totalTokens = 0;

      // Fetch costs for each account in parallel
      const costPromises = accounts.map(acc =>
        this.getBedrockCostForAccount(acc.id, startDateStr, endDateStr)
          .catch(err => {
            logger.error('Cost fetch failed for account', { accountId: acc.id, error: err.message });
            return { accountId: acc.id, totalCost: 0, modelCosts: {} };
          })
      );

      const costResults = await Promise.all(costPromises);

      costResults.forEach(result => {
        results[result.accountId] = {
          cost: result.totalCost,
          modelCosts: result.modelCosts
        };
        totalCost += result.totalCost;
      });

      return {
        period: { startDate: startDateStr, endDate: endDateStr },
        accounts: results,
        summary: {
          totalCost: totalCost.toFixed(2),
          averageCostPerAccount: (totalCost / accounts.length).toFixed(2),
          totalAccounts: accounts.length
        }
      };
    } catch (error) {
      logger.error('Failed to get organization metrics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get usage summary for an account
   */
  async getAccountUsageSummary(accountId) {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const startDateStr = startOfMonth.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];

      const costData = await this.getBedrockCostForAccount(accountId, startDateStr, endDateStr);

      // Daily cost
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayStr = startOfDay.toISOString().split('T')[0];
      const endOfDayStr = today.toISOString().split('T')[0];

      const dailyCostData = await this.getBedrockCostForAccount(
        accountId,
        startOfDayStr,
        endOfDayStr
      );

      // Project monthly
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const daysPassed = today.getDate();
      const projectedMonthly = (costData.totalCost / daysPassed) * daysInMonth;

      return {
        accountId,
        monthly: costData.totalCost,
        daily: dailyCostData.totalCost,
        projectedMonthly: projectedMonthly.toFixed(2),
        modelCosts: costData.modelCosts
      };
    } catch (error) {
      logger.error('Failed to get account usage summary', {
        accountId,
        error: error.message
      });
      return {
        accountId,
        monthly: 0,
        daily: 0,
        projectedMonthly: 0,
        modelCosts: {}
      };
    }
  }
}

module.exports = MultiAccountAggregator;

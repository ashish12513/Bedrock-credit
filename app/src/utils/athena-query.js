/**
 * Athena Query Service - Direct queries to S3 Bedrock logs
 * Bypasses Lambda proxy and queries Athena directly for cost data
 */

const AWS = require('aws-sdk');
const logger = require('./logger')('AthenaQuery');

const athena = new AWS.Athena({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });

// Athena configuration
const DATABASE = 'bedrock_cost_db';
const TABLE = 'bedrock_logs';
const OUTPUT_LOCATION = `s3://bedrock-athena-results-prod-${process.env.AWS_ACCOUNT_ID}/`;

class AthenaQueryService {
  
  /**
   * Execute a query and get results
   */
  async executeQuery(queryString) {
    try {
      logger.debug('Executing Athena query', { queryString: queryString.substring(0, 100) });
      
      const params = {
        QueryString: queryString,
        QueryExecutionContext: {
          Database: DATABASE
        },
        ResultConfiguration: {
          OutputLocation: OUTPUT_LOCATION
        }
      };

      // Start query execution
      const queryExecution = await athena.startQueryExecution(params).promise();
      const queryExecutionId = queryExecution.QueryExecutionId;
      
      // Wait for query to complete
      await this.waitForQueryCompletion(queryExecutionId);
      
      // Get results
      const results = await this.getQueryResults(queryExecutionId);
      
      logger.debug('Query executed successfully', { queryExecutionId, resultCount: results.length });
      
      return results;
    } catch (error) {
      logger.error('Athena query failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Wait for query to complete
   */
  async waitForQueryCompletion(queryExecutionId, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await athena.getQueryExecution({
          QueryExecutionId: queryExecutionId
        }).promise();
        
        const status = response.QueryExecution.Status.State;
        
        if (status === 'SUCCEEDED') {
          return true;
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          throw new Error(`Query ${status}: ${response.QueryExecution.Status.StateChangeReason}`);
        }
        
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Error checking query status', { error: error.message });
        throw error;
      }
    }
    
    throw new Error('Query execution timeout');
  }

  /**
   * Get query results from S3
   */
  async getQueryResults(queryExecutionId) {
    try {
      const resultsKey = `${queryExecutionId}.csv`;
      
      const response = await s3.getObject({
        Bucket: OUTPUT_LOCATION.replace('s3://', '').split('/')[0],
        Key: resultsKey
      }).promise();
      
      const csv = response.Body.toString('utf-8');
      const lines = csv.split('\n');
      
      // Parse CSV to JSON
      const headers = lines[0].split(',').map(h => h.trim());
      const results = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim());
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index];
          });
          results.push(row);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to get query results', { error: error.message });
      return [];
    }
  }

  /**
   * Get daily spending
   */
  async getDailySpending() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const query = `
        SELECT 
          DATE_FORMAT(FROM_ISO8601_TIMESTAMP(invocationTimestamp), '%Y-%m-%d') as date,
          modelId as model,
          requestAccountId as account,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2))) as input_tokens,
          SUM(CAST(outputTokenCount AS DECIMAL(18,2))) as output_tokens,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2)) * 0.000003 + CAST(outputTokenCount AS DECIMAL(18,2)) * 0.000012) as estimated_cost
        FROM ${TABLE}
        WHERE DATE_FORMAT(FROM_ISO8601_TIMESTAMP(invocationTimestamp), '%Y-%m-%d') = '${today}'
        GROUP BY modelId, requestAccountId
        ORDER BY estimated_cost DESC
      `;
      
      const results = await this.executeQuery(query);
      return results;
    } catch (error) {
      logger.warn('Failed to query daily spending', { error: error.message });
      return [];
    }
  }

  /**
   * Get total spending
   */
  async getTotalSpending() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_invocations,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2))) as total_input_tokens,
          SUM(CAST(outputTokenCount AS DECIMAL(18,2))) as total_output_tokens,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2)) * 0.000003 + CAST(outputTokenCount AS DECIMAL(18,2)) * 0.000012) as total_cost
        FROM ${TABLE}
      `;
      
      const results = await this.executeQuery(query);
      return results.length > 0 ? results[0] : {};
    } catch (error) {
      logger.warn('Failed to query total spending', { error: error.message });
      return {};
    }
  }

  /**
   * Get spending by model
   */
  async getSpendingByModel() {
    try {
      const query = `
        SELECT 
          modelId as model,
          COUNT(*) as invocations,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2))) as input_tokens,
          SUM(CAST(outputTokenCount AS DECIMAL(18,2))) as output_tokens,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2)) * 0.000003 + CAST(outputTokenCount AS DECIMAL(18,2)) * 0.000012) as cost
        FROM ${TABLE}
        GROUP BY modelId
        ORDER BY cost DESC
        LIMIT 10
      `;
      
      const results = await this.executeQuery(query);
      return results;
    } catch (error) {
      logger.warn('Failed to query spending by model', { error: error.message });
      return [];
    }
  }

  /**
   * Get spending by account
   */
  async getSpendingByAccount() {
    try {
      const query = `
        SELECT 
          requestAccountId as account,
          COUNT(*) as invocations,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2))) as input_tokens,
          SUM(CAST(outputTokenCount AS DECIMAL(18,2))) as output_tokens,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2)) * 0.000003 + CAST(outputTokenCount AS DECIMAL(18,2)) * 0.000012) as cost
        FROM ${TABLE}
        GROUP BY requestAccountId
        ORDER BY cost DESC
      `;
      
      const results = await this.executeQuery(query);
      return results;
    } catch (error) {
      logger.warn('Failed to query spending by account', { error: error.message });
      return [];
    }
  }

  /**
   * Get hourly trend
   */
  async getHourlyTrend() {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('hour', FROM_ISO8601_TIMESTAMP(invocationTimestamp)) as hour,
          COUNT(*) as invocations,
          SUM(CAST(inputTokenCount AS DECIMAL(18,2)) * 0.000003 + CAST(outputTokenCount AS DECIMAL(18,2)) * 0.000012) as cost
        FROM ${TABLE}
        WHERE FROM_ISO8601_TIMESTAMP(invocationTimestamp) > current_timestamp - interval '24' hour
        GROUP BY DATE_TRUNC('hour', FROM_ISO8601_TIMESTAMP(invocationTimestamp))
        ORDER BY hour DESC
      `;
      
      const results = await this.executeQuery(query);
      return results;
    } catch (error) {
      logger.warn('Failed to query hourly trend', { error: error.message });
      return [];
    }
  }
}

module.exports = AthenaQueryService;

/**
 * Data Service - Provides real data from S3 Bedrock logs
 * Queries S3 directly to get spending information
 */

const AWS = require('aws-sdk');
const logger = require('./logger')('DataService');

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = `bedrock-logs-prod-${process.env.AWS_ACCOUNT_ID || '737185589565'}`;

class DataService {
  
  constructor() {
    this.cache = {
      files: null,
      lastFetch: 0,
      cacheTTL: 300000 // 5 minutes
    };
  }

  /**
   * Get all log files from S3 (with caching)
   */
  async getLogFiles() {
    try {
      const now = Date.now();
      
      // Return cached if still fresh
      if (this.cache.files && (now - this.cache.lastFetch) < this.cache.cacheTTL) {
        logger.debug('Using cached file list');
        return this.cache.files;
      }

      logger.info('Fetching file list from S3');
      
      const params = {
        Bucket: BUCKET,
        Prefix: 'AWSLogs/',
        MaxKeys: 1000
      };

      const response = await s3.listObjectsV2(params).promise();
      const files = response.Contents || [];
      
      // Cache the results
      this.cache.files = files;
      this.cache.lastFetch = now;
      
      logger.info('File list cached', { fileCount: files.length });
      return files;
    } catch (error) {
      logger.error('Failed to list log files', { error: error.message });
      return this.cache.files || [];
    }
  }

  /**
   * Read and parse a single log file
   */
  async parseLogFile(key) {
    try {
      const params = {
        Bucket: BUCKET,
        Key: key
      };

      let response = await s3.getObject(params).promise();
      let data = response.Body;
      
      // Decompress if gzipped
      if (key.endsWith('.gz')) {
        const zlib = require('zlib');
        data = zlib.gunzipSync(data);
      }

      const text = data.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim());
      
      // Parse JSONL format
      const logs = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          logger.debug('Failed to parse JSON line', { line: line.substring(0, 50) });
          return null;
        }
      }).filter(log => log !== null);

      return logs;
    } catch (error) {
      logger.debug('Failed to parse log file', { key, error: error.message });
      return [];
    }
  }

  /**
   * Get monthly spending from S3 logs
   */
  async getDailySpending() {
    // Alias for getMonthlySpendings for backwards compatibility
    return this.getMonthlySpendings();
  }

  /**
   * Get monthly spending from S3 logs
   */
  async getMonthlySpendings() {
    try {
      logger.info('Fetching monthly spending from S3');
      
      const files = await this.getLogFiles();
      
      // Group files by month
      const monthlyData = {};
      
      files.forEach(f => {
        const match = f.Key.match(/\/(\d{4}\/\d{2})\//);
        if (match) {
          const month = match[1];
          if (!monthlyData[month]) {
            monthlyData[month] = [];
          }
          monthlyData[month].push(f);
        }
      });

      // Get current month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      let currentMonthFiles = (monthlyData[currentMonth] || [])
        .filter(f => f.Key.endsWith('.json.gz'))
        .slice(0, 5); // Reduced from 20 to 5

      if (currentMonthFiles.length === 0) {
        logger.info('No log files for current month, using latest available');
        // Use latest month available
        const latestMonth = Object.keys(monthlyData).sort().reverse()[0];
        if (!latestMonth) {
          return { month: currentMonth, models: {}, accounts: {}, totalCost: 0, totalInvocations: 0 };
        }
        
        const latestFiles = monthlyData[latestMonth]
          .filter(f => f.Key.endsWith('.json.gz'))
          .slice(0, 5); // Reduced from 20 to 5
        
        return await this._calculateSpending(latestMonth, latestFiles);
      }

      return await this._calculateSpending(currentMonth, currentMonthFiles);
    } catch (error) {
      logger.error('Failed to get monthly spending', { error: error.message });
      const now = new Date();
      const currentMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      return { month: currentMonth, models: {}, accounts: {}, totalCost: 0, totalInvocations: 0 };
    }
  }

  /**
   * Calculate spending from files
   */
  async _calculateSpending(period, files) {
    const spending = {
      period,
      models: {},
      accounts: {},
      totalCost: 0,
      totalInvocations: 0
    };

    for (const file of files) {
      try {
        const logs = await this.parseLogFile(file.Key);
        
        logs.forEach(log => {
          if (log.errorCode) return;
          
          const model = log.modelId || 'unknown';
          const account = log.accountId || 'unknown';
          const inputTokens = parseInt(log.input?.inputTokenCount) || 0;
          const outputTokens = parseInt(log.output?.outputTokenCount) || 0;
          const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
          
          if (!spending.models[model]) {
            spending.models[model] = { invocations: 0, cost: 0, tokens: 0 };
          }
          spending.models[model].invocations++;
          spending.models[model].cost += cost;
          spending.models[model].tokens += inputTokens + outputTokens;
          
          if (!spending.accounts[account]) {
            spending.accounts[account] = { invocations: 0, cost: 0, tokens: 0 };
          }
          spending.accounts[account].invocations++;
          spending.accounts[account].cost += cost;
          spending.accounts[account].tokens += inputTokens + outputTokens;
          
          spending.totalCost += cost;
          spending.totalInvocations++;
        });
      } catch (e) {
        logger.debug('Error processing file', { file: file.Key });
      }
    }

    return spending;
  }

  /**
   * Get total spending across all time
   */
  async getTotalSpending() {
    try {
      logger.info('Fetching total spending from S3');
      
      const files = await this.getLogFiles();
      const jsonFiles = files.filter(f => f.Key.endsWith('.json.gz'));
      
      if (jsonFiles.length === 0) {
        return { totalCost: 0, totalInvocations: 0, totalTokens: 0 };
      }

      let totalCost = 0;
      let totalInvocations = 0;
      let totalTokens = 0;

      // Parse only first 5 files for speed
      for (const file of jsonFiles.slice(0, 5)) {
        try {
          const logs = await this.parseLogFile(file.Key);
          
          logs.forEach(log => {
            if (log.errorCode) return;
            
            const inputTokens = parseInt(log.input?.inputTokenCount) || 0;
            const outputTokens = parseInt(log.output?.outputTokenCount) || 0;
            const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
            
            totalCost += cost;
            totalInvocations++;
            totalTokens += inputTokens + outputTokens;
          });
        } catch (e) {
          logger.debug('Error processing file', { file: file.Key });
        }
      }

      logger.info('Total spending calculated', { 
        invocations: totalInvocations,
        cost: totalCost.toFixed(4)
      });
      
      return { totalCost, totalInvocations, totalTokens };
    } catch (error) {
      logger.error('Failed to get total spending', { error: error.message });
      return { totalCost: 0, totalInvocations: 0, totalTokens: 0 };
    }
  }
}

module.exports = new DataService();

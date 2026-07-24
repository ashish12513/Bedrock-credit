/**
 * Logger utility for consistent logging
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

class Logger {
  constructor(module) {
    this.module = module;
    this.level = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;
  }

  format(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      module: this.module,
      message,
      ...data
    };
  }

  error(message, data) {
    if (this.level >= LOG_LEVELS.error) {
      console.error(JSON.stringify(this.format('ERROR', message, data)));
    }
  }

  warn(message, data) {
    if (this.level >= LOG_LEVELS.warn) {
      console.warn(JSON.stringify(this.format('WARN', message, data)));
    }
  }

  info(message, data) {
    if (this.level >= LOG_LEVELS.info) {
      console.log(JSON.stringify(this.format('INFO', message, data)));
    }
  }

  debug(message, data) {
    if (this.level >= LOG_LEVELS.debug) {
      console.log(JSON.stringify(this.format('DEBUG', message, data)));
    }
  }
}

module.exports = (module) => new Logger(module);

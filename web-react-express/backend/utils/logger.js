const fs = require('fs');
const path = require('path');
const { format, subDays } = require('date-fns');
const iconv = require('iconv-lite');
const { promisify } = require('util');

const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

class UltraLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../python/logs');
    this.maxLogDays = 7;
    this.encoding = 'utf8';
    
    // 显式绑定方法上下文
    this.createErrorLog = this.createErrorLog.bind(this);
    this.formatError = this.formatError.bind(this);
    
    this.initialize();
  }

  async initialize() {
    await this.ensureLogDir();
    this.startAutoClean();
  }

  async ensureLogDir() {
    try {
      await mkdirAsync(this.logDir, { recursive: true });
    } catch (err) {
      console.error('无法创建日志目录:', err);
      throw err;
    }
  }

  startAutoClean() {
    setInterval(() => this.rotateLogs(), 3600000);
  }

  // 使用箭头函数保持上下文
  rotateLogs = async () => {
    try {
      const files = await readdirAsync(this.logDir);
      const cutoff = subDays(new Date(), this.maxLogDays);

      for (const file of files) {
        if (!file.startsWith('error_')) continue;

        const filePath = path.join(this.logDir, file);
        const stats = await statAsync(filePath);

        if (stats.birthtime < cutoff) {
          await unlinkAsync(filePath);
        }
      }
    } catch (err) {
      console.error('日志轮转失败:', err);
    }
  }

  // 修改为箭头函数
  createErrorLog = async (error) => {
    try {
      const content = this.formatError(error);
      const filename = this.generateLogFilename();
      const filePath = path.join(this.logDir, filename);

      const buffer = iconv.encode(content, 'utf8');
      await fs.promises.writeFile(filePath, buffer);
      
      return path.relative(process.cwd(), filePath);
    } catch (err) {
      console.error('创建错误日志失败:', err);
      return null;
    }
  }

  // 保持方法绑定
  formatError(error) {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
    let output = `[${timestamp}] ERROR\n`;

    if (error instanceof Error) {
      output += `Message: ${error.message}\n`;
      output += `Stack: ${error.stack || '无堆栈信息'}\n`;
    } else {
      output += `Detail: ${JSON.stringify(error, null, 2)}\n`;
    }

    return output + '\n';
  }

  generateLogFilename() {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    return `error_${timestamp}.log`;
  }
}

// 导出单例实例
module.exports = new UltraLogger();

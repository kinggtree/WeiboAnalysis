const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');  // 引入 iconv-lite

const router = express.Router();

// 获取所有集合名称
router.get('/collections', async (req, res) => {
  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE;

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'get_collections'
  ], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  // 收集错误输出 (GBK 转 UTF-8)
  pythonProcess.stderr.on('data', (data) => {
    // 使用 iconv-lite 将 GBK Buffer 转换为 UTF-8 字符串
    const output = iconv.decode(data, 'gbk');
    errOutput += output;
    console.error(`stderr: ${output}`);
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0 || errOutput) {
      const logPath = await logger.createErrorLog(errOutput);
      
      return res.status(500).json({
        error: '获取集合列表失败',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const collections = JSON.parse(result);
      res.json(collections);
    } catch (e) {
      const logPath = await logger.createErrorLog(errOutput);
      res.status(500).json({
        error: '响应格式错误',
        logPath: logPath || '无可用日志路径'
      });
    }
  });
});

// 执行MongoDB查询
router.post('/query', async (req, res) => {
  const { collection, limit } = req.body;
  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE;

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'execute_query'
  ], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  // 通过标准输入发送参数
  pythonProcess.stdin.write(JSON.stringify({ collection, limit: limit || 0 }));
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  // 收集错误输出 (GBK 转 UTF-8)
  pythonProcess.stderr.on('data', (data) => {
    // 使用 iconv-lite 将 GBK Buffer 转换为 UTF-8 字符串
    const output = iconv.decode(data, 'gbk');
    errOutput += output;
    console.error(`stderr: ${output}`);
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0 || errOutput) {
      const logPath = await logger.createErrorLog(errOutput);
      
      return res.status(500).json({
        error: '查询执行失败',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const queryData = JSON.parse(result);
      res.json(queryData);
    } catch (e) {
      const logPath = await logger.createErrorLog(errOutput);
      res.status(500).json({
        error: '响应格式错误',
        logPath: logPath || '无可用日志路径'
      });
    }
  });
});

// 执行情感分析
router.post('/sentiment', async (req, res) => {
  const { data } = req.body;
  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE;

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'analyze_sentiment',
    JSON.stringify(data)
  ], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  // 通过标准输入发送数据
  pythonProcess.stdin.write(JSON.stringify(data));
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  // 收集错误输出 (GBK 转 UTF-8)
  pythonProcess.stderr.on('data', (data) => {
    // 使用 iconv-lite 将 GBK Buffer 转换为 UTF-8 字符串
    const output = iconv.decode(data, 'gbk');
    errOutput += output;
    console.error(`stderr: ${output}`);
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0 || errOutput) {
      const logPath = await logger.createErrorLog(errOutput);
      
      return res.status(500).json({
        error: '情感分析失败',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const analysisResult = JSON.parse(result);
      res.json(analysisResult);
    } catch (e) {
      const logPath = await logger.createErrorLog(errOutput);
      res.status(500).json({
        error: '响应格式错误',
        logPath: logPath || '无可用日志路径'
      });
    }
  });
});

module.exports = router;

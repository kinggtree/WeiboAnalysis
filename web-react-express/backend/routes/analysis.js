const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');

const router = express.Router();

// 获取所有集合名称
router.get('/collections', async (req, res) => {
  console.log('获取集合列表...');
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

  pythonProcess.stderr.on('data', (data) => {
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
      console.log('获取集合列表成功:', collections);
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

  // 写入请求参数到标准输入
  pythonProcess.stdin.write(JSON.stringify({ 
    collection, 
    limit: limit || 0 
  }));
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  pythonProcess.stderr.on('data', (data) => {
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
    'analyze_sentiment'
  ], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  // 写入分析数据到标准输入
  pythonProcess.stdin.write(JSON.stringify(data));
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  pythonProcess.stderr.on('data', (data) => {
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

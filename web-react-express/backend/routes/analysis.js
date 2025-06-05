const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');
const os = require('os');

const router = express.Router();

const dataCacheDir = path.join(__dirname, '..', 'data_cache'); // 定义缓存目录路径
if (!fs.existsSync(dataCacheDir)) {
  try {
    fs.mkdirSync(dataCacheDir);
    console.log(`Created data cache directory: ${dataCacheDir}`);
  } catch (err) {
    console.error(`Error creating data cache directory: ${err}`);
    // 根据需要决定是否退出程序或进行其他错误处理
  }
}

// 获取所有集合名称
router.get('/collections', async (req, res) => {
  console.log('获取集合列表...');
  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE || 'python'; // 添加默认值

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'get_collections'
  ], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  pythonProcess.stderr.on('data', (data) => {
    const output = iconv.decode(data, 'gbk'); // 保持GBK解码以查看原始错误
    errOutput += output;
    console.error(`stderr (get_collections): ${output}`);
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0 || errOutput.toLowerCase().includes('error')) {
      const logMessage = `Exit code: ${code}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('获取集合列表失败:', logMessage);
      return res.status(500).json({
        error: '获取集合列表失败',
        details: errOutput || 'Python script exited with non-zero code.',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const collections = JSON.parse(result);
      console.log('获取集合列表成功:', collections);
      res.json(collections);
    } catch (e) {
      const logMessage = `Error parsing JSON: ${e}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('解析集合列表响应失败:', logMessage);
      res.status(500).json({
        error: '响应格式错误',
        details: e.message,
        logPath: logPath || '无可用日志路径'
      });
    }
  });

   pythonProcess.on('error', async (err) => { // 捕获 spawn 本身的错误
     const logMessage = `Spawn error (get_collections): ${err}`;
     const logPath = await logger.createErrorLog(logMessage);
     console.error(logMessage);
     res.status(500).json({
       error: '无法启动 Python 脚本',
       details: err.message,
       logPath: logPath || '无可用日志路径'
     });
   });
});

// 执行MongoDB查询并保存结果到CSV
router.post('/query', async (req, res) => {
  const { collection, limit } = req.body;
  console.log(`执行查询: collection=${collection}, limit=${limit}`);
  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'execute_query'
  ], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

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
    console.error(`stderr (execute_query): ${output}`);
  });

  pythonProcess.on('close', async (code) => {
    if (code !== 0 || errOutput.toLowerCase().includes('error')) {
      const logMessage = `Exit code: ${code}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('查询执行失败:', logMessage);
      return res.status(500).json({
        error: '查询执行失败',
        details: errOutput || 'Python script exited with non-zero code.',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const queryData = JSON.parse(result);
      console.log(`查询成功，获取到 ${queryData.length} 条数据`);

      if (queryData && queryData.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // 清理集合名称，移除可能导致问题的字符
        const safeCollectionName = collection.replace(/[^a-zA-Z0-9_-]/g, '_');
        const csvFilename = `query_data_${safeCollectionName}_${timestamp}.csv`;
        const csvFilePath = path.join(dataCacheDir, csvFilename);

        try {
          const parser = new Parser();
          const csv = parser.parse(queryData);
          fs.writeFileSync(csvFilePath, csv, 'utf-8');
          console.log(`查询结果已保存到: ${csvFilePath}`);

          // 返回原始数据和CSV文件名给前端
          res.json({ queryData: queryData, csvFilename: csvFilename }); // 返回包含两部分的对象
        } catch (csvError) {
          console.error(`保存 CSV 文件失败: ${csvError}`);
          // 即使CSV保存失败，仍然尝试返回原始数据，但可能需要前端进行相应处理
           res.status(500).json({
               error: '保存查询结果为CSV时出错',
               details: csvError.message
           });
        }
      } else {
        // 如果没有数据，也正常返回空数组和null文件名
         console.log('查询结果为空，不生成CSV文件');
        res.json({ queryData: [], csvFilename: null });
      }

    } catch (e) {
      const logMessage = `Error parsing JSON: ${e}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('解析查询响应失败:', logMessage);
      res.status(500).json({
        error: '响应格式错误',
        details: e.message,
        logPath: logPath || '无可用日志路径'
      });
    }
  });

   pythonProcess.on('error', async (err) => { // 捕获 spawn 本身的错误
     const logMessage = `Spawn error (execute_query): ${err}`;
     const logPath = await logger.createErrorLog(logMessage);
     console.error(logMessage);
     res.status(500).json({
       error: '无法启动 Python 脚本',
       details: err.message,
       logPath: logPath || '无可用日志路径'
     });
   });
});

// 执行情感分析（通过CSV文件）
router.post('/sentiment', async (req, res) => {
  const { csvFilename } = req.body;
  console.log(`执行情感分析，使用文件: ${csvFilename}`);

  if (!csvFilename) {
    return res.status(400).json({ error: '缺少 csvFilename 参数' });
  }

  const csvFilePath = path.join(dataCacheDir, csvFilename);

  if (!fs.existsSync(csvFilePath)) {
      console.error(`错误：CSV文件未找到 - ${csvFilePath}`);
      return res.status(404).json({ error: `指定的CSV文件未找到: ${csvFilename}` });
  }


  const pythonScript = path.resolve(__dirname, '../python/analysisBridge.py');
  const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';

  let result = '';
  let errOutput = '';

  const pythonProcess = spawn(pythonExec, [
    pythonScript,
    'analyze_sentiment_from_csv'
  ], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  });

  pythonProcess.stdin.write(JSON.stringify({ csv_filepath: csvFilePath }));
  pythonProcess.stdin.end();

  pythonProcess.stdout.on('data', (data) => {
    result += data;
  });

  pythonProcess.stderr.on('data', (data) => {
    const output = iconv.decode(data, 'gbk');
    errOutput += output;
    console.error(`stderr (analyze_sentiment): ${output}`);
  });

  pythonProcess.on('close', async (code) => {

    if (code !== 0 || errOutput.toLowerCase().includes('error')) {
      const logMessage = `Exit code: ${code}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('情感分析失败:', logMessage);
      return res.status(500).json({
        error: '情感分析失败',
        details: errOutput || 'Python script exited with non-zero code.',
        logPath: logPath || '无可用日志路径'
      });
    }

    try {
      const analysisResult = JSON.parse(result);
      console.log('情感分析成功');
      res.json(analysisResult);
    } catch (e) {
      const logMessage = `Error parsing JSON: ${e}\nStderr: ${errOutput}\nStdout: ${result}`;
      const logPath = await logger.createErrorLog(logMessage);
      console.error('解析情感分析响应失败:', logMessage);
      res.status(500).json({
        error: '响应格式错误',
        details: e.message,
        logPath: logPath || '无可用日志路径'
      });
    }
  });

  pythonProcess.on('error', async (err) => { // 捕获 spawn 本身的错误
     const logMessage = `Spawn error (analyze_sentiment): ${err}`;
     const logPath = await logger.createErrorLog(logMessage);
     console.error(logMessage);
     res.status(500).json({
       error: '无法启动 Python 脚本',
       details: err.message,
       logPath: logPath || '无可用日志路径'
     });
   });
});

module.exports = router;
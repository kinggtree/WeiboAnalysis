const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');
const router = express.Router();
const fs = require('fs');
const toml = require('toml');

const configPath = path.resolve(__dirname, '../python/WeiBoCrawler/config.toml');

// 统一处理Python子进程
function runPythonProcess(action, params = {}) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, '../python/cookieBridge.py');
    const pythonExec = process.env.PYTHON_EXECUTABLE;

    let stdout = '';
    let stderr = '';
    
    const pythonProcess = spawn(pythonExec, [pythonScript], {
      env: { 
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      },
      shell: process.platform === 'win32'
    });

    // 发送输入数据
    pythonProcess.stdin.write(JSON.stringify({ action, params }));
    pythonProcess.stdin.end();

    // 处理标准输出
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    // 处理错误输出（Windows兼容）
    pythonProcess.stderr.on('data', (data) => {
      const decoded = process.platform === 'win32' 
        ? iconv.decode(data, 'cp936')  // Windows使用GBK编码
        : data.toString('utf8');
      stderr += decoded;
    });

    // 处理进程退出
    pythonProcess.on('close', (code) => {
      if (code !== 0 || stderr) {
        const error = new Error(`Python process exited with code ${code}`);
        error.stderr = stderr;
        return reject(error);
      }
      
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        e.message = `JSON解析失败: ${e.message}`;
        e.stdout = stdout;
        reject(e);
      }
    });
  });
}

// 生成二维码端点
router.post('/generate-qr', async (req, res) => {
  try {
    const result = await runPythonProcess('generate_qr');
    
    if (result.status === 'error') {
      const logPath = await logger.createErrorLog(result.message);
      return res.status(500).json({
        status: 'error',
        message: result.message,
        logPath: logPath || '无可用日志'
      });
    }

    res.json({
      status: 'success',
      data: {
        image: result.image,
        client: result.client,
        login_signin_url: result.login_signin_url,
        qrid: result.qrid
      }
    });
    
  } catch (error) {
    const logPath = await logger.createErrorLog(error.stderr || error.message);
    res.status(500).json({
      status: 'error',
      message: process.env.NODE_ENV === 'production' 
        ? '服务器内部错误' 
        : error.message,
      logPath: logPath || '无可用日志'
    });
  }
});

// 检查登录状态端点
router.post('/check-login', async (req, res) => {
  try {
    const { client, login_signin_url, qrid } = req.body;
    
    if (!client || !login_signin_url || !qrid) {
      return res.status(400).json({
        status: 'error',
        message: '缺少必要参数'
      });
    }

    const result = await runPythonProcess('check_login', {
      client,
      login_signin_url,
      qrid
    });

    // 登录成功后读取最新配置
    if (result.status === 'success') {
      try {
        const configData = toml.parse(fs.readFileSync(configPath, 'utf-8'));
        return res.json({
          status: 'success',
          cookies: configData.cookies,
          update_time: configData.cookies_info?.update_time
        });
      } catch (readError) {
        console.error('读取配置文件失败:', readError);
        // 如果读取失败，返回Python进程返回的原始数据
        return res.json({
          status: 'success',
          cookies: result.cookies,
          update_time: result.update_time
        });
      }
    }
    
    // 其他状态直接返回
    return res.json(result);
    
  } catch (error) {
    const logPath = await logger.createErrorLog(error.stderr || error.message);
    res.status(500).json({
      status: 'error',
      message: process.env.NODE_ENV === 'production'
        ? '登录状态检查失败'
        : error.message,
      logPath: logPath || '无可用日志'
    });
  }
});


// 获取上次cookie的接口
router.get('/get-last-cookies', async (req, res) => {
  try {
    
    if (!fs.existsSync(configPath)) {
      return res.json({ status: 'success', cookies: null });
    }

    const configData = toml.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (configData.cookies && Object.keys(configData.cookies).length > 0) {
      return res.json({
        status: 'success',
        cookies: configData.cookies,
        update_time: configData.cookies_info?.update_time
      });
    }
    
    res.json({ status: 'success', cookies: null });
  } catch (error) {
    console.error('读取cookie失败:', error);
    res.status(500).json({
      status: 'error',
      message: '读取cookie失败',
      error: error.message
    });
  }
});

module.exports = router;
const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();
const path = require('path');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');
const fs = require('fs');

router.post('/list-search', async (req, res) => {
  try {
    // 参数预处理
    const params = {
      search_for: req.body.search_for || '',
      kind: req.body.kind || '综合',
      advanced_kind: req.body.advanced_kind || '综合',
      start: req.body.start || '2020-01-01',
      end: req.body.end || new Date().toISOString().split('T')[0]
    };

    // 执行Python进程
    const result = await runPythonSearchProcess(params);

    // 成功响应
    res.json({
      status: 'success',
      data: result,
      update_time: new Date().toISOString()
    });

  } catch (error) {
    // 统一错误处理
    const logPath = await logger.createErrorLog(error.stderr || error.message);
    res.status(500).json({
      status: 'error',
      message: process.env.NODE_ENV === 'production' 
        ? '搜索服务暂时不可用' 
        : error.message,
      logPath: logPath || '无可用日志',
      errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 封装的Python进程执行函数
async function runPythonSearchProcess(params) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, '../python/bridge/listSearchBridge.py');
    const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';

    // 详细路径验证
    console.log('Python路径验证:', {
      path: pythonExec,
      exists: fs.existsSync(pythonExec)
    });
    if (!fs.existsSync(pythonExec)) {
      return reject(new Error(`Python解释器不存在于: ${pythonExec}`));
    }

    const decoder = new TextDecoder(process.platform === 'win32' ? 'gbk' : 'utf-8');
    let stdout = '';
    let stderr = '';

    const pythonProcess = spawn(
      pythonExec,
      [pythonScript],
      {
        env: {
          ...process.env,
          PYTHONPATH: [
            path.join(__dirname, '../python'),
            path.join(__dirname, '../../WeiBoCrawler'),
            path.join(__dirname, '../../web/util'),
            process.env.PYTHONPATH || ''
          ].join(path.delimiter),
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        },
        cwd: path.dirname(pythonScript),
        windowsHide: true,
        shell: false,
        windowsVerbatimArguments: true // 禁用Windows参数自动转义
      }
    );

    // 结构化参数传递
    pythonProcess.stdin.write(JSON.stringify(params));
    pythonProcess.stdin.end();

    // 输出处理
    pythonProcess.stdout.on('data', (data) => {
      stdout += decoder.decode(data, { stream: true });
    });

    pythonProcess.stderr.on('data', (data) => {
      const decoded = decoder.decode(data, { stream: true });
      stderr += decoded;
      console.error('[PYTHON ERROR]', decoded);
    });

    // 事件处理
    pythonProcess.on('error', (err) => {
      console.error('进程启动失败详情:', {
        errorCode: err.code,
        path: err.path,
        syscall: err.syscall,
        spawnedArgs: err.spawnargs
      });
      reject(new Error(`进程启动失败: ${err.message}`));
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 || stderr) {
        const error = new Error(`Python进程退出代码: ${code}`);
        error.stderr = stderr;
        return reject(error);
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        e.stdout = stdout;
        reject(e);
      }
    });
  });
}

module.exports = router;

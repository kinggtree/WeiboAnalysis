const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();
const path = require('path');
const logger = require('../utils/logger');
const iconv = require('iconv-lite');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // Import UUID generator (install: npm install uuid)

// --- In-memory Cache ---
// Structure: Map<searchId, { data: Array<any>, timestamp: number, total: number }>
const searchCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // Cache results for 15 minutes

// --- Function to clean up expired cache entries ---
function cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
            console.log(`Cache expired, removing searchId: ${key}`);
            searchCache.delete(key);
        }
    }
}
// Periodically clean up cache (e.g., every 5 minutes)
setInterval(cleanupExpiredCache, 5 * 60 * 1000);


// --- Initial Search Route ---
router.post('/list-search', async (req, res) => {
  // --- Default page size for the initial request ---
  const initialPageSize = parseInt(req.query.pageSize || '25', 10); // Allow overriding default via query param if needed

  try {
    // 参数预处理 (搜索参数)
    const searchParams = {
      search_for: req.body.search_for || '',
      kind: req.body.kind || '综合',
      advanced_kind: req.body.advanced_kind || '综合',
      start: req.body.start || '2020-01-01',
      end: req.body.end || new Date().toISOString().split('T')[0]
    };

    // 1. 执行 Python 进程获取 *所有* 结果
    console.log("Initiating Python script for new search...");
    const fullResult = await runPythonSearchProcess(searchParams); // fullResult is the complete array

    // 2. 检查 fullResult 是否为数组
    if (!Array.isArray(fullResult)) {
        console.warn("Python script did not return an array.");
        // Return empty result but still success status code
        return res.json({
            status: 'success',
            searchId: null, // No ID if no results
            data: [],
            pagination: { current: 1, pageSize: initialPageSize, total: 0 },
            update_time: new Date().toISOString()
        });
    }

    // 3. 生成唯一的 Search ID
    const searchId = uuidv4();
    const totalItems = fullResult.length;

    // 4. 存储完整结果到缓存
    searchCache.set(searchId, {
        data: fullResult,
        timestamp: Date.now(),
        total: totalItems
    });
    console.log(`Cached results for searchId: ${searchId}, total items: ${totalItems}`);

    // 5. 获取第一页数据
    const firstPageData = fullResult.slice(0, initialPageSize);

    // 6. 成功响应 (发送第一页数据 + searchId)
    res.json({
      status: 'success',
      searchId: searchId, // Send the ID to the client
      data: firstPageData, // Only send the first page
      pagination: {
        current: 1,
        pageSize: initialPageSize,
        total: totalItems // Send total count
      },
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

// --- New Route for Fetching Subsequent Pages ---
router.get('/list-search/page', (req, res) => {
    const { searchId, page, pageSize } = req.query;

    if (!searchId || !page || !pageSize) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing required query parameters: searchId, page, pageSize'
        });
    }

    const pageNum = parseInt(page, 10);
    const sizeNum = parseInt(pageSize, 10);

    if (isNaN(pageNum) || isNaN(sizeNum) || pageNum < 1 || sizeNum < 1) {
         return res.status(400).json({
            status: 'error',
            message: 'Invalid page or pageSize parameters'
        });
    }

    // 1. 从缓存中查找
    const cachedEntry = searchCache.get(searchId);

    // 2. 检查缓存是否存在且未过期
    if (!cachedEntry || (Date.now() - cachedEntry.timestamp > CACHE_TTL_MS)) {
        if (cachedEntry) {
            searchCache.delete(searchId); // Remove expired entry
            console.log(`Cache expired for searchId: ${searchId}`);
        } else {
            console.log(`Cache miss for searchId: ${searchId}`);
        }
        return res.status(404).json({ // 404 Not Found is appropriate here
            status: 'error',
            message: 'Search results not found or expired. Please perform the search again.'
        });
    }

    // 3. 缓存命中，进行分页
    const { data: fullResult, total: totalItems } = cachedEntry;
    const startIndex = (pageNum - 1) * sizeNum;
    const pagedData = fullResult.slice(startIndex, startIndex + sizeNum);

    // 4. 返回分页结果
    res.json({
        status: 'success',
        data: pagedData,
        pagination: {
            current: pageNum,
            pageSize: sizeNum,
            total: totalItems
        },
        update_time: new Date(cachedEntry.timestamp).toISOString() // Reflect cache time
    });
});


// runPythonSearchProcess 函数保持不变
async function runPythonSearchProcess(params) {
  // ... (内部逻辑不变，仍然返回解析后的完整 JSON 数据)
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, '../python/listSearchBridge.py');
    const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';
    console.log(`Attempting to spawn Python using command: ${pythonExec}`);

    if (!fs.existsSync(pythonScript)) {
        return reject(new Error(`Python script not found: ${pythonScript}`));
    }

    const stdoutDecoder = new TextDecoder('utf-8');
    const stderrDecoder = new TextDecoder('utf-8');
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
        shell: process.platform === 'win32',
      }
    );

    try {
        pythonProcess.stdin.write(JSON.stringify(params));
        pythonProcess.stdin.end();
    } catch (e) {
        return reject(new Error(`Failed to write to Python stdin: ${e.message}`));
    }

    pythonProcess.stdout.on('data', (data) => {
      stdout += stdoutDecoder.decode(data, { stream: true });
    });

    pythonProcess.stderr.on('data', (data) => {
      const decoded = stderrDecoder.decode(data, { stream: true });
      stderr += decoded;
      console.error('[PYTHON STDERR]', decoded);
    });

    pythonProcess.on('error', (err) => {
      console.error('Process spawn error details:', err);
      reject(new Error(`Failed to start Python process (${err.syscall} ${err.path}): ${err.message}`));
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        const error = new Error(`Python process exited with non-zero code: ${code}`);
        error.stdout = stdout;
        error.stderr = stderr || 'No stderr output.';
        return reject(error);
      }
      if (stderr.trim()) {
          console.warn("Python process exited successfully but produced stderr output.");
      }

      try {
        let jsonString = stdout;
        const newlineIndex = stdout.indexOf('\n');
        if (newlineIndex !== -1) {
          jsonString = stdout.substring(newlineIndex + 1);
          // console.log("Removed first line, attempting to parse the rest as JSON."); // Less verbose logging
        } else {
          console.warn("Stdout contains only one line. Attempting to parse it directly.");
        }

        jsonString = jsonString.trim();
        if (!jsonString) {
          console.warn("After removing the first line (if any), the remaining output is empty.");
          return resolve([]); // Resolve with empty array if no JSON
        }
        resolve(JSON.parse(jsonString)); // Parse the full JSON array

      } catch (e) {
        console.error("Failed to parse Python output as JSON.");
        e.message = `Failed to parse Python output: ${e.message}`;
        e.stdout = stdout;
        e.stderr = stderr;
        reject(e);
      }
    });
  });
}


module.exports = router;

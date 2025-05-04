const logger = require('./backend/utils/logger');
const fs = require('fs');

async function testLogger() {
  // 测试正常中文
  const path1 = await logger.createErrorLog('中文测试');
  console.log('测试1日志路径:', path1);

  // 测试混合编码
  const mixedData = Buffer.from('a0ff', 'hex').toString('binary') + '中文';
  const path2 = await logger.createErrorLog(mixedData);
  console.log('测试2日志路径:', path2);

  // 验证文件内容
  [path1, path2].forEach(p => {
    if (p) {
      const content = fs.readFileSync(p);
      console.log(`文件 ${p} 内容验证:`);
      console.log('Hex:', content.toString('hex'));
    }
  });
}

testLogger();

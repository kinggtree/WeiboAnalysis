const { spawn } = require('child_process');

// 测试Python输出
const pyTest = spawn('python', ['-c', 'print("中文测试")'], {
  env: { ...process.env, PYTHONIOENCODING: 'utf8' },
  encoding: 'utf8'
});

pyTest.stdout.on('data', (data) => {
  console.log('Python输出测试:');
  console.log('Raw:', data);
  console.log('Hex:', Buffer.from(data).toString('hex'));
});

// 测试Node.js写入
const fs = require('fs');
fs.writeFileSync('encoding-test.txt', '中文测试', 'utf8');
console.log('文件写入测试完成');

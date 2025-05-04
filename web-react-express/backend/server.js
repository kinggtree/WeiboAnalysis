require('dotenv').config();
console.log('Using Python:', process.env.PYTHON_EXECUTABLE);

const express = require('express');
const cors = require('cors');
const listSearchRouter = require('./routes/listSearch');
const cookieRouter = require('./routes/cookie');
const sentimentAnalysis = require('./routes/analysis');

const app = express();

// 解决跨域问题
app.use(cors({
  origin: 'http://localhost:3000' // React默认端口
}));

// 解析JSON请求体
app.use(express.json());

// 挂载路由
app.use('/api', listSearchRouter);
app.use('/api/cookie', cookieRouter);
app.use('/api/analysis', sentimentAnalysis);

// 启动服务
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

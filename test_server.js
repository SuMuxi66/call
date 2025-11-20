const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 5502;

// 配置multer用于处理文件上传
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 提供静态文件服务
app.use(express.static('.'));

// 处理POST请求
app.post('/api/dify/chat', upload.array('files'), (req, res) => {
  console.log('收到前端POST请求:');
  console.log('- Headers:', req.headers);
  console.log('- Query Parameters:', req.query);
  
  // 模拟处理过程
  setTimeout(() => {
    // 返回模拟的成功响应
    const mockResponse = {
      event: 'message',
      task_id: 'test_task_id',
      id: 'test_message_id',
      message_id: 'test_message_id',
      conversation_id: 'test_conversation_id',
      mode: 'advanced-chat',
      answer: '这是来自测试服务器的模拟响应。在实际环境中，这个响应会来自Dify API。',
      metadata: {
        annotation_reply: null,
        retriever_resources: [],
        usage: {
          prompt_tokens: 100,
          prompt_unit_price: '0',
          prompt_price_unit: '0',
          prompt_price: '0',
          completion_tokens: 50,
          completion_unit_price: '0',
          completion_price_unit: '0',
          completion_price: '0',
          total_tokens: 150,
          total_price: '0',
          currency: 'RMB',
          latency: 2.123
        }
      },
      created_at: Date.now()
    };
    
    console.log('发送模拟响应给前端:', JSON.stringify(mockResponse, null, 2));
    res.json(mockResponse);
  }, 1000);
});

// 处理根路径重定向到frontend_test.html
app.get('/', (req, res) => {
  res.redirect('/frontend_test.html');
});

app.listen(port, () => {
  console.log(`测试服务器运行在端口 ${port}`);
  console.log(`打开浏览器访问: http://localhost:${port}/frontend_test.html`);
});
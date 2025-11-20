const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testRealPDF() {
  try {
    // 读取真实的test.pdf文件
    const filePath = './test.pdf';
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ test.pdf文件不存在');
      return;
    }

    const fileStats = fs.statSync(filePath);
    console.log(`📄 文件信息:`);
    console.log(`   文件名: test.pdf`);
    console.log(`   文件大小: ${fileStats.size} bytes`);
    console.log(`   修改时间: ${fileStats.mtime.toLocaleString()}`);

    // 检查文件头
    const fileBuffer = fs.readFileSync(filePath);
    const fileHeader = fileBuffer.slice(0, 10).toString('utf8');
    console.log(`   文件头: ${fileHeader}`);

    // 创建表单数据
    const formData = new FormData();
    formData.append('query', '请帮我分析这个PDF文件的内容和结构');
    formData.append('user', 'real_pdf_user');
    formData.append('files', fileBuffer, {
      filename: 'test.pdf',
      contentType: 'application/pdf'
    });

    console.log('\n🚀 正在上传到AI服务...');
    
    // 发送到后端API
    const response = await axios.post('http://localhost:7000/api/dify/chat', formData, {
      headers: formData.getHeaders()
    });

    console.log(`📊 响应状态: ${response.status}`);
    console.log(`🤖 AI回复: ${response.data.answer}`);
    
    if (response.data.files && response.data.files.length > 0) {
      console.log(`📁 处理的文件: ${response.data.files.length}个`);
      response.data.files.forEach(file => {
        console.log(`   - ${file.name} (${file.size} bytes)`);
      });
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testRealPDF();
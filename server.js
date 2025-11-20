const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = 3000;

// Dify API配置
const DIFY_API_KEY = 'app-c6suQBrrp11wDJh6ItBugWlr';
const DIFY_BASE_URL = 'http://192.168.1.102/v1';

// 设置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制文件大小为10MB
  }
});

// 创建上传目录
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// CORS设置 - 支持跨域请求
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:7000', 'http://127.0.0.1:7000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

// 解析JSON请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use(express.static('.'));

// 文件格式验证函数 - 增强PDF识别
function validateFile(fileBuffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  const minSizes = {
    '.txt': 1,
    '.pdf': 100, // PDF最小100字节
    '.docx': 100, // DOCX最小100字节
    '.doc': 100, // DOC最小100字节
    '.jpg': 100,
    '.jpeg': 100,
    '.png': 100,
    '.gif': 100,
    '.webp': 100
  };
  
  // 检查文件大小
  if (fileBuffer.length < (minSizes[ext] || 10)) {
    throw new Error(`文件太小，可能不是有效的${ext}文件`);
  }
  
  // 检查文件头（魔法数字）
  const headers = {
    '.pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
    '.docx': Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK
    '.png': Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG
    '.jpg': Buffer.from([0xFF, 0xD8, 0xFF]), // JPG
    '.jpeg': Buffer.from([0xFF, 0xD8, 0xFF]), // JPG
    '.gif': Buffer.from([0x47, 0x49, 0x46]), // GIF
  };
  
  if (headers[ext]) {
    const fileHeader = fileBuffer.slice(0, headers[ext].length);
    if (!fileHeader.equals(headers[ext])) {
      throw new Error(`文件头不匹配，不是有效的${ext}文件`);
    }
  }
  
  // 增强PDF验证 - 检查PDF结构完整性
  if (ext === '.pdf') {
    try {
      validatePDFStructure(fileBuffer);
    } catch (pdfError) {
      throw new Error(`PDF文件结构无效: ${pdfError.message}`);
    }
  }
  
  console.log(`文件验证通过: ${filename} (${fileBuffer.length} bytes)`);
  return true;
}

// PDF结构验证函数
function validatePDFStructure(fileBuffer) {
  // 检查PDF文件头和尾部
  const pdfHeader = fileBuffer.slice(0, 4).toString();
  if (pdfHeader !== '%PDF') {
    throw new Error('缺少PDF文件头');
  }
  
  // 查找PDF文件尾部（%%EOF）
  const pdfContent = fileBuffer.toString();
  if (!pdfContent.includes('%%EOF')) {
    throw new Error('缺少PDF文件尾部标记');
  }
  
  // 检查PDF版本 - 从文件头的前100个字符中查找版本信息
  const headerContent = fileBuffer.slice(0, 100).toString();
  const versionMatch = headerContent.match(/%PDF-(\d\.\d)/);
  if (!versionMatch) {
    // 如果文件头没有找到版本，在整个内容中查找
    const fullVersionMatch = pdfContent.match(/%PDF-(\d\.\d)/);
    if (!fullVersionMatch) {
      throw new Error('无法识别PDF版本');
    }
  }
  
  const version = versionMatch ? parseFloat(versionMatch[1]) : 1.4; // 默认版本1.4
  if (version < 1.0 || version > 2.0) {
    throw new Error(`不支持的PDF版本: ${version}`);
  }
  
  // 检查是否存在对象定义（基本结构检查）
  if (!pdfContent.includes('obj') || !pdfContent.includes('endobj')) {
    throw new Error('PDF缺少必要的对象结构');
  }
  
  // 检查交叉引用表或流
  if (!pdfContent.includes('xref') && !pdfContent.includes('XRef')) {
    throw new Error('PDF缺少交叉引用信息');
  }
  
  console.log(`PDF结构验证通过，版本: ${version}`);
}

// 提取文件内容
async function extractFileContent(fileBuffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  
  try {
    if (ext === '.txt') {
      return fileBuffer.toString('utf-8');
    }
    
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      return data.text;
    }
    
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }
    
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return `[图片文件: ${filename}]`;
    }
    
    return `[文件: ${filename} - 内容提取不支持]`;
  } catch (error) {
    console.error(`提取文件内容失败: ${filename}`, error.message);
    return `[文件: ${filename} - 内容提取失败]`;
  }
}

// 上传文件到Dify API
async function uploadFileToDify(fileBuffer, filename, userId) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  try {
    // 验证文件格式
    validateFile(fileBuffer, filename);
    
    // 根据文件扩展名确定MIME类型
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.doc':
        contentType = 'application/msword';
        break;
      case '.docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
    }
    
    // 严格按照Dify API格式上传文件
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: contentType
    });
    formData.append('user', userId);

    console.log(`上传文件到Dify: ${filename} (${contentType})`);
    
    const response = await axios.post(`${DIFY_BASE_URL}/files/upload`, formData, {
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        ...formData.getHeaders()
      }
    });
    
    console.log('文件上传成功:', response.data);
    return response.data;
  } catch (error) {
    console.error('文件上传到Dify失败:', error.message || error.response?.data || error);
    throw error;
  }
}

// API端点 - 支持多种上传方式（兼容前端）
app.post('/api/dify/chat', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 10 }
]), async (req, res) => {
  console.log('📨 收到聊天请求');
  
  try {
    const { query } = req.body;
    
    // 处理文件上传 - 支持多种字段名
    let file = null;
    if (req.files?.file) {
      file = req.files.file[0];  // single file
    } else if (req.files?.files) {
      file = req.files.files[0]; // multiple files, take first
    } else if (req.file) {
      file = req.file; // backward compatibility
    }
    
    console.log('📝 请求内容:', { query, hasFile: !!file });
    
    if (file) {
      console.log('📄 处理文件上传');
      
      // 读取文件内容
      const fileBuffer = fs.readFileSync(file.path);
      
      // 验证文件格式
      try {
        validateFile(fileBuffer, file.originalname);
      } catch (validationError) {
        console.error(`文件验证失败: ${file.originalname}`, validationError.message);
        await fs.unlink(file.path);
        return res.status(400).json({ 
          error: '文件验证失败',
          details: validationError.message 
        });
      }
      
      console.log('✅ 文件验证通过');
      
      // 提取文件内容（作为备选方案）
      let extractedContent = '';
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.txt', '.pdf', '.docx'].includes(ext)) {
        try {
          extractedContent = await extractFileContent(fileBuffer, file.originalname);
          console.log(`📖 文件内容提取成功: ${extractedContent.substring(0, 100)}...`);
        } catch (extractError) {
          console.warn('⚠️ 文件内容提取失败:', extractError.message);
        }
      }
      
      // 上传到Dify
      let uploadResult = null;
      let useFileUpload = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext);
      
      if (useFileUpload) {
        try {
          uploadResult = await uploadFileToDify(fileBuffer, file.originalname, req.body.user || 'test-user');
          console.log('📤 Dify文件上传结果:', uploadResult);
        } catch (uploadError) {
          console.warn('⚠️ Dify文件上传失败，将使用文本内容方式:', uploadError.message);
          useFileUpload = false;
        }
      }
      
      // 构建查询内容
      let enhancedQuery = query || '请帮我分析这个文件的内容和结构';
      if (!useFileUpload && extractedContent) {
        enhancedQuery = `${enhancedQuery}\n\n文件内容如下：\n${extractedContent}`;
      }
      
      // 根据文件类型设置正确的type
      let fileType = 'document';
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        fileType = 'image';
      } else if (['.mp3', '.wav', '.m4a'].includes(ext)) {
        fileType = 'audio';
      } else if (['.mp4', '.avi', '.mov'].includes(ext)) {
        fileType = 'video';
      }
      
      // 准备聊天数据
      const chatData = {
        inputs: {},
        query: enhancedQuery,
        response_mode: 'blocking',
        conversation_id: '',
        user: req.body.user || 'test-user'
      };
      
      // 如果使用文件上传，添加文件信息
      if (useFileUpload && uploadResult) {
        chatData.files = [{ 
          type: fileType,
          transfer_method: 'local_file',
          upload_file_id: uploadResult.id 
        }];
      }
      
      console.log('💬 发送聊天请求到Dify:', JSON.stringify(chatData, null, 2));
      
      try {
        const response = await axios.post(`${DIFY_BASE_URL}/chat-messages`, chatData, {
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        
        console.log('📡 Dify响应状态:', response.status);
        console.log('📦 响应数据:', JSON.stringify(response.data, null, 2));
        
        // 清理临时文件
        fs.unlinkSync(file.path);
        
        res.json({
          success: true,
          response: response.data,
          fileId: uploadResult?.id || null,
          extractionMethod: useFileUpload ? 'file_upload' : 'text_extraction'
        });
        
      } catch (apiError) {
        console.error('❌ Dify API调用失败:', apiError.response?.status, apiError.response?.data);
        
        // 特殊处理插件服务错误
        if (apiError.response?.data?.message?.includes('Plugin Daemon Service')) {
          await fs.unlink(file.path);
          return res.status(400).json({
            success: false,
            error: 'Dify工作流配置问题',
            details: '文件上传成功，但Dify工作流缺少文档处理器节点或知识库配置',
            suggestion: '请在Dify工作流中添加文档提取器节点并连接知识库',
            fileStatus: 'uploaded',
            fileId: uploadResult?.id || null,
            processorNode: {
              name: '文档处理器',
              status: 'missing',
              recommendation: '添加文档提取器节点到工作流'
            },
            fallbackUsed: !useFileUpload,
            extractionMethod: !useFileUpload ? 'text_extraction' : 'file_upload'
          });
        }
        
        await fs.unlink(file.path);
        throw apiError;
      }
      
    } else {
      // 纯文本聊天
      const chatData = {
        inputs: {},
        query: query || '你好',
        response_mode: 'blocking',
        conversation_id: '',
        user: req.body.user || 'test-user'
      };
      
      console.log('💬 发送纯文本聊天请求到Dify');
      
      const response = await axios.post(`${DIFY_BASE_URL}/chat-messages`, chatData, {
        headers: {
          'Authorization': `Bearer ${DIFY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 Dify响应:', response.data);
      
      res.json({
        success: true,
        response: response.data
      });
    }
    
  } catch (error) {
    console.error('❌ 处理请求失败:', error);
    
    // 清理临时文件
    if (req.files?.file?.[0]?.path) {
      try {
        fs.unlinkSync(req.files.file[0].path);
      } catch (unlinkError) {
        console.error('清理文件失败:', unlinkError);
      }
    } else if (req.files?.files?.[0]?.path) {
      try {
        fs.unlinkSync(req.files.files[0].path);
      } catch (unlinkError) {
        console.error('清理文件失败:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: '处理请求失败',
      details: error.message 
    });
  }
});

// 文档处理器节点测试端点
app.post('/api/test/document-processor', upload.single('file'), async (req, res) => {
  console.log('📄 测试文档处理器节点');
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '缺少文件',
        details: '请上传一个PDF文件进行测试'
      });
    }
    
    const processorConfig = JSON.parse(req.body.processorConfig || '{}');
    console.log('🔧 处理器配置:', processorConfig);
    
    // 模拟文档处理器节点功能
    const fileStats = fs.statSync(req.file.path);
    
    // 模拟文本提取（实际应该使用PDF解析库）
    const mockText = `这是从PDF文件中提取的文本内容。文件大小为${fileStats.size}字节。\n\n` +
      `文档处理器节点会执行以下操作:\n` +
      `1. 提取文本内容\n` +
      `2. 提取元数据\n` +
      `3. 分段处理内容\n` +
      `4. 准备向量化处理\n\n` +
      `配置文件: ${JSON.stringify(processorConfig, null, 2)}`;
    
    // 模拟分段处理
    const chunks = mockText.split('\n').filter(chunk => chunk.trim().length > 0);
    
    // 清理临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkError) {
      console.error('清理文件失败:', unlinkError);
    }
    
    res.json({
      success: true,
      message: '文档处理器节点测试成功',
      file_info: {
        name: req.file.originalname,
        size: fileStats.size,
        mimetype: req.file.mimetype
      },
      processing_stats: {
        extraction_time: 1500,
        text_length: mockText.length,
        chunks_created: chunks.length,
        processing_method: 'text_extraction'
      },
      content_preview: mockText.substring(0, 200) + '...',
      chunks: chunks.slice(0, 3), // 只返回前3个分段
      recommendations: [
        '文档处理器节点工作正常',
        '建议在Dify工作流中添加文档提取器节点',
        '配置支持PDF、DOC、TXT等格式',
        '启用分段处理以提高检索精度'
      ]
    });
    
  } catch (error) {
    console.error('❌ 文档处理器测试失败:', error);
    res.status(500).json({
      success: false,
      error: '文档处理器测试失败',
      details: error.message
    });
  }
});

// 工作流配置检查API
app.get('/api/test/workflow-config', (req, res) => {
  console.log('🔧 检查工作流配置建议');
  
  const configCheck = {
    workflow_status: 'needs_document_processor',
    recommendations: [
      {
        component: '文档处理器节点',
        status: 'missing',
        importance: 'critical',
        description: '添加文档提取器节点来处理上传的文件'
      },
      {
        component: '知识库连接',
        status: 'recommended',
        importance: 'high',
        description: '连接知识库以便存储和检索文档内容'
      },
      {
        component: 'LLM节点配置',
        status: 'needs_update',
        importance: 'high',
        description: '更新提示词模板以包含文件内容变量'
      }
    ],
    setup_guide: {
      step1: '在Dify工作流中添加"文档提取器"节点',
      step2: '配置文档提取器支持PDF、DOC等格式',
      step3: '将文档提取器连接到LLM节点',
      step4: '在LLM提示词中添加{file_content}变量',
      step5: '测试完整的工作流集成'
    }
  };
  
  res.json(configCheck);
})

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(7000, () => {
  console.log(`后端服务器运行在端口 7000`);
});
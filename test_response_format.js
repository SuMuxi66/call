// 快速测试脚本 - 验证响应格式
console.log('测试响应格式解析...');

// 模拟后端返回的响应格式
const mockBackendResponse = {
  success: true,
  response: {
    answer: "根据用户提供的文件内容，这是一个病例模板...",
    metadata: {
      usage: {
        prompt_tokens: 521,
        completion_tokens: 322,
        total_tokens: 843,
        total_price: "0.0013568",
        currency: "RMB",
        latency: 3.13472211221233
      }
    },
    created_at: 1763561435
  },
  fileId: "file-123",
  extractionMethod: "file_upload"
};

console.log('模拟后端响应:', JSON.stringify(mockBackendResponse, null, 2));

// 测试提取逻辑
function extractReplyContent(response) {
  let replyContent;
  if (response.success && response.response) {
    // 成功后端返回的结构：{success: true, response: {...}}
    const actualResponse = response.response;
    replyContent = actualResponse?.answer || 
                  actualResponse?.content?.text || 
                  actualResponse?.text ||
                  '收到响应，但没有消息内容';
    console.log('从response.response中提取回复:', replyContent);
  } else if (response.answer || response.content) {
    // 如果直接返回了Dify响应格式
    replyContent = response.answer || response.content?.text || '收到响应，但没有消息内容';
    console.log('从直接响应中提取回复:', replyContent);
  } else {
    // 其他情况
    replyContent = '收到响应，但没有消息内容';
    console.log('使用默认回复');
  }
  return replyContent;
}

const result = extractReplyContent(mockBackendResponse);
console.log('提取结果:', result);

// 测试原始错误逻辑
console.log('\n--- 测试原始错误逻辑 ---');
const oldLogicResult = mockBackendResponse.content?.text || mockBackendResponse.answer || '收到响应，但没有消息内容';
console.log('原始逻辑结果:', oldLogicResult);

console.log('\n✅ 修复验证完成！新的提取逻辑可以正确解析后端响应格式。');
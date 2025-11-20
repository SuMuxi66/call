const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testDocumentProcessor() {
    console.log('🚀 开始测试文档处理器节点...\n');
    
    try {
        // 检查测试文件是否存在
        const testFilePath = path.join(__dirname, 'test.pdf');
        if (!fs.existsSync(testFilePath)) {
            console.log('❌ 测试文件 test.pdf 不存在');
            return;
        }
        
        console.log('📁 找到测试文件:', testFilePath);
        
        // 创建表单数据
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFilePath));
        formData.append('processorConfig', JSON.stringify({
            extractText: true,
            extractMetadata: true,
            enableOCR: false,
            chunkContent: true
        }));
        
        console.log('📤 发送文档处理器测试请求...');
        
        // 发送测试请求
        const response = await axios.post('http://localhost:7000/api/test/document-processor', formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 30000
        });
        
        console.log('✅ 测试成功！\n');
        console.log('📊 测试结果:');
        console.log('─'.repeat(50));
        console.log(JSON.stringify(response.data, null, 2));
        console.log('─'.repeat(50));
        
        // 分析结果
        const result = response.data;
        if (result.success) {
            console.log('\n🎉 文档处理器节点工作正常！');
            console.log('📄 处理文件:', result.file_info.name);
            console.log('⏱️ 处理时间:', result.processing_stats.extraction_time);
            console.log('📊 文本长度:', result.processing_stats.text_length);
            console.log('🔗 创建分段:', result.processing_stats.chunks_created);
            
            console.log('\n💡 下一步建议:');
            result.recommendations.forEach(rec => {
                console.log(`   • ${rec}`);
            });
        }
        
    } catch (error) {
        console.log('❌ 测试失败:\n');
        if (error.response) {
            console.log('状态码:', error.response.status);
            console.log('错误信息:', error.response.data);
        } else {
            console.log('错误:', error.message);
        }
    }
}

async function checkWorkflowConfig() {
    console.log('\n🔧 检查工作流配置建议...\n');
    
    try {
        const response = await axios.get('http://localhost:7000/api/test/workflow-config');
        const config = response.data;
        
        console.log('📋 工作流配置状态:', config.workflow_status);
        console.log('\n🔍 配置建议:');
        
        config.recommendations.forEach((rec, index) => {
            console.log(`\n${index + 1}. ${rec.component}`);
            console.log(`   状态: ${rec.status}`);
            console.log(`   重要性: ${rec.importance}`);
            console.log(`   说明: ${rec.description}`);
        });
        
        console.log('\n📖 配置步骤:');
        Object.entries(config.setup_guide).forEach(([step, description]) => {
            console.log(`   ${step}: ${description}`);
        });
        
    } catch (error) {
        console.log('❌ 配置检查失败:', error.message);
    }
}

// 运行测试
async function runAllTests() {
    console.log('🎯 文档处理器节点测试工具');
    console.log('='.repeat(60));
    console.log('🚀 测试你的Dify文档处理器节点配置');
    console.log('='.repeat(60));
    
    await testDocumentProcessor();
    await checkWorkflowConfig();
    
    console.log('\n✅ 测试完成！');
    console.log('\n🌐 访问测试页面获取更多信息:');
    console.log('   http://localhost:7000/document_processor_test.html');
    console.log('   http://localhost:7000/dify_workflow_test.html');
}

// 检查服务器是否运行
async function checkServer() {
    try {
        await axios.get('http://localhost:7000/api/health', { timeout: 5000 });
        return true;
    } catch (error) {
        console.log('❌ 服务器未运行，请先启动服务器');
        console.log('   命令: node server.js');
        return false;
    }
}

// 主函数
async function main() {
    const serverRunning = await checkServer();
    if (serverRunning) {
        await runAllTests();
    }
}

// 运行程序
main().catch(error => {
    console.error('程序运行失败:', error);
    process.exit(1);
});
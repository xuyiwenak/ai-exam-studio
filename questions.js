// Public demo data. The local server serves .local/questions.js instead when present.
window.EXAM_BANKS = {
  demo: {
    title: '示例题库',
    source: '项目内置示例',
    questions: [
      {id: 'demo-1', type: 'single', text: '模拟考试提交后，哪里可以查看每道题的答案？', options: ['考试报告', 'AI 配置', '文件选择器'], answer: [0], explanation: ''},
      {id: 'demo-2', type: 'multiple', text: '导入新题库后，建议检查哪些内容？', options: ['题干', '选项', '正确答案', '模型名称'], answer: [0, 1, 2], explanation: ''},
      {id: 'demo-3', type: 'boolean', text: '扫描版 PDF 的页面图片需要由支持图片输入的模型处理。', options: ['正确', '错误'], answer: [0], explanation: ''},
      {id: 'demo-4', type: 'single', text: '没有明确答案的客观题会怎样处理？', options: ['不参与自动计分', '自动猜一个答案', '删除整个题库'], answer: [0], explanation: ''},
      {id: 'demo-5', type: 'essay', text: '写下你希望在下一次模拟考试中改进的地方。', options: [], answer: [], explanation: ''},
    ],
  },
};

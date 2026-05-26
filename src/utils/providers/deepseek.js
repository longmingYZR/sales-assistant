export const name = 'DeepSeek';
export const keyPlaceholder = 'sk-...';

export async function ask(question, chunks, apiKey) {
  const contextText = chunks
    .map((c) => `[来源: ${c.fileName}]\n${c.content}`)
    .join('\n\n');

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `你是一个销售助手，根据以下产品文档内容回答用户问题。请用中文回答（如果用户用西班牙语提问，请用西班牙语回答）。回答时注明信息来源文件名。

产品文档内容：
${contextText || '暂无上传文档'}

用户问题：${question}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API 请求失败 (${response.status})`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

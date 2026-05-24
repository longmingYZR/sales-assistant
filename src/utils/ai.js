import * as claude from './providers/claude.js';
import * as deepseek from './providers/deepseek.js';

const providers = { claude, deepseek };

export function getProviders() {
  return Object.entries(providers).map(([id, p]) => ({ id, name: p.name, keyPlaceholder: p.keyPlaceholder }));
}

export function getProvider(id) {
  return providers[id] || null;
}

export async function askAI(question, chunks, apiKey, providerId = 'claude') {
  const provider = providers[providerId];
  if (!provider) throw new Error(`未知的 AI 提供商: ${providerId}`);
  return provider.ask(question, chunks, apiKey);
}

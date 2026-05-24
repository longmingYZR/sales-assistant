import { askAI } from './ai.js';

export async function askClaude(question, chunks, apiKey) {
  return askAI(question, chunks, apiKey, 'claude');
}

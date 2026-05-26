const CHUNK_SIZE = 1000;
const OVERLAP = 200;

export function chunkText(text) {
  if (!text || text.length === 0) return [];

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({
      index,
      content: text.slice(start, end),
    });
    start += CHUNK_SIZE - OVERLAP;
    index++;
  }

  return chunks;
}

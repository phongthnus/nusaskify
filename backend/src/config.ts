const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be a number, got "${raw}"`);
  return n;
};

export const config = {
  port: num('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://nus:nus@localhost:5434/nusaskify',

  ollamaHost: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
  embedModel: process.env.EMBED_MODEL ?? 'qwen3-embedding:0.6b',
  embedDim: num('EMBED_DIM', 1024),
  chatModel: process.env.CHAT_MODEL ?? 'qwen3:4b-instruct',

  defaultTopK: num('DEFAULT_TOP_K', 5),
  minScore: num('MIN_SCORE', 0.47),

  semanticThreshold: num('SEMANTIC_THRESHOLD', 0.75),
  semanticChunkSize: num('SEMANTIC_CHUNK_SIZE', 600),
  structureChunkSize: num('STRUCTURE_CHUNK_SIZE', 400),

  maxUploadBytes: 20 * 1024 * 1024,
};

export const CHUNK_STRATEGIES = ['semantic', 'structure'] as const;
export type ChunkStrategy = (typeof CHUNK_STRATEGIES)[number];

import { RecursiveChunker, SemanticChunker } from '@chonkiejs/core';
import { config, type ChunkStrategy } from '../config.js';
import { embed } from './models.js';

/**
 * Semantic chunking (Chonkie SemanticChunker):
 *   split into sentences -> embed (sliding window of sentences) -> cosine similarity between
 *   neighbours -> split where similarity drops into a valley below `threshold`
 *   -> split again any group longer than `chunkSize`.
 * Uses the SAME embedding model as indexing/querying (via the `embed` callback).
 */
let semanticChunker: SemanticChunker | null = null;
async function getSemanticChunker() {
  semanticChunker ??= await SemanticChunker.create({
    embeddings: embed,
    threshold: config.semanticThreshold, // lower -> fewer splits
    chunkSize: config.semanticChunkSize, // max size (character tokenizer by default)
  });
  return semanticChunker;
}

/** Structure-based chunking: paragraphs -> sentences -> words, merged up to chunkSize. */
let structureChunker: RecursiveChunker | null = null;
async function getStructureChunker() {
  structureChunker ??= await RecursiveChunker.create({ chunkSize: config.structureChunkSize });
  return structureChunker;
}

export async function chunkText(text: string, strategy: ChunkStrategy): Promise<string[]> {
  const chunker = strategy === 'semantic' ? await getSemanticChunker() : await getStructureChunker();
  const chunks = await chunker.chunk(text);
  return chunks.map((c) => c.text.trim()).filter((t) => t.length > 0);
}

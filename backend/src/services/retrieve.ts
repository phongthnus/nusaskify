import { config, type ChunkStrategy } from '../config.js';
import { pool, toVector } from '../db.js';
import { embedOne } from './models.js';

export interface RetrievedChunk {
  chunk_id: number;
  document_id: string;
  doc_key: string;
  title: string;
  version: number;
  chunk_index: number;
  content: string;
  score: number; // cosine similarity, higher = more similar
}

export interface SearchParams {
  tenantId: string;
  question: string;
  documentIds?: string[]; // undefined = all of the tenant's valid documents
  topK?: number;
  strategy?: ChunkStrategy;
}

/**
 * Filter (tenant, selected docs, still valid) is part of the SAME SQL query as the vector
 * ordering, so it is applied BEFORE top-k — never "top-k first, then filter".
 */
export async function searchChunks(p: SearchParams): Promise<RetrievedChunk[]> {
  const qVec = await embedOne(p.question);
  const { rows } = await pool.query(
    `SELECT c.id AS chunk_id, c.document_id, d.doc_key, d.title, d.version, c.chunk_index, c.content,
            1 - (c.embedding <=> $1::vector) AS score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.tenant_id = $2
       AND ($3::uuid[] IS NULL OR d.id = ANY($3::uuid[]))
       AND d.status = 'active'
       AND d.valid_from <= CURRENT_DATE
       AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
       AND c.strategy = $4
     ORDER BY c.embedding <=> $1::vector
     LIMIT $5`,
    [toVector(qVec), p.tenantId, p.documentIds ?? null, p.strategy ?? 'semantic', p.topK ?? config.defaultTopK],
  );
  return rows.map((r) => ({ ...r, chunk_id: Number(r.chunk_id), score: Number(r.score) }));
}

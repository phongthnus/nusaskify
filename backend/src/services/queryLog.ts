import { pool } from '../db.js';
import type { RetrievedChunk } from './retrieve.js';

export async function logQuery(entry: {
  tenantId: string;
  endpoint: 'search' | 'ask';
  question: string;
  documentIds?: string[];
  strategy: string;
  topK: number;
  chunks: RetrievedChunk[];
  status?: string;
  answer?: string;
  citations?: unknown;
  rawLlmOutput?: string;
  latencyMs: number;
}): Promise<number | null> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO query_logs (tenant_id, endpoint, question, document_ids, strategy, top_k,
         retrieved_chunk_ids, scores, status, answer, citations, raw_llm_output, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [entry.tenantId, entry.endpoint, entry.question, entry.documentIds ?? null, entry.strategy, entry.topK,
       entry.chunks.map((c) => c.chunk_id), entry.chunks.map((c) => c.score), entry.status ?? null,
       entry.answer ?? null, entry.citations ? JSON.stringify(entry.citations) : null,
       entry.rawLlmOutput ?? null, entry.latencyMs],
    );
    return Number(rows[0].id);
  } catch (e) {
    console.error('Failed to write query log', e); // logging must never break a request
    return null;
  }
}

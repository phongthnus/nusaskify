import { Router } from 'express';
import { z } from 'zod';
import { CHUNK_STRATEGIES, config } from '../config.js';
import { ask } from '../services/ask.js';
import { logQuery } from '../services/queryLog.js';
import { searchChunks } from '../services/retrieve.js';

const baseBody = z.object({
  question: z.string().trim().min(1, 'question is required').max(2000),
  document_ids: z.array(z.uuid()).min(1, 'select at least one document').optional(),
  strategy: z.enum(CHUNK_STRATEGIES).default('semantic'),
});
const searchBody = baseBody.extend({ top_k: z.number().int().min(1).max(50).default(config.defaultTopK) });
const askBody = baseBody.extend({ top_k: z.number().int().min(1).max(20).default(config.defaultTopK) });

export const qaRouter = Router();

/**
 * @openapi
 * /api/search:
 *   post:
 *     tags: [Q&A]
 *     summary: Semantic search only (no LLM) → chunks with cosine-similarity scores
 *     parameters: [{ $ref: '#/components/parameters/TenantHeader' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question]
 *             properties:
 *               question: { type: string, example: How many days can I work from home? }
 *               document_ids: { type: array, items: { type: string, format: uuid }, description: Omit = all valid docs of the tenant }
 *               top_k: { type: integer, default: 5 }
 *               strategy: { type: string, enum: [semantic, structure], default: semantic }
 *     responses:
 *       200:
 *         description: Top-k chunks, best first
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { log_id: { type: integer }, chunks: { type: array, items: { $ref: '#/components/schemas/RetrievedChunk' } } } }
 */
qaRouter.post('/search', async (req, res) => {
  const body = searchBody.parse(req.body ?? {});
  const t0 = Date.now();
  const chunks = await searchChunks({
    tenantId: req.tenantId, question: body.question, documentIds: body.document_ids,
    topK: body.top_k, strategy: body.strategy,
  });
  const log_id = await logQuery({
    tenantId: req.tenantId, endpoint: 'search', question: body.question, documentIds: body.document_ids,
    strategy: body.strategy, topK: body.top_k, chunks, latencyMs: Date.now() - t0,
  });
  res.json({ log_id, chunks });
});

/**
 * @openapi
 * /api/ask:
 *   post:
 *     tags: [Q&A]
 *     summary: RAG answer with citations, or "not enough information"
 *     description: |
 *       tenant → filter (tenant, selected docs, still valid) inside the vector query → top-k →
 *       if best score < MIN_SCORE return `insufficient` → LLM answers with [n] citations →
 *       citations not pointing to a retrieved chunk are removed.
 *     parameters: [{ $ref: '#/components/parameters/TenantHeader' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question]
 *             properties:
 *               question: { type: string, example: How many days can I work from home? }
 *               document_ids: { type: array, items: { type: string, format: uuid } }
 *               top_k: { type: integer, default: 5 }
 *               strategy: { type: string, enum: [semantic, structure], default: semantic }
 *     responses:
 *       200:
 *         description: Answer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 log_id: { type: integer }
 *                 status: { type: string, enum: [answered, insufficient] }
 *                 answer: { type: string }
 *                 reason: { type: string, description: Why the answer is insufficient }
 *                 citations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       marker: { type: integer, description: 'The n in [n] inside the answer' }
 *                       chunk_id: { type: integer }
 *                       document_id: { type: string }
 *                       title: { type: string }
 *                       version: { type: integer }
 *                       chunk_index: { type: integer }
 *                 chunks: { type: array, items: { $ref: '#/components/schemas/RetrievedChunk' } }
 */
qaRouter.post('/ask', async (req, res) => {
  const body = askBody.parse(req.body ?? {});
  const t0 = Date.now();
  const result = await ask({
    tenantId: req.tenantId, question: body.question, documentIds: body.document_ids,
    topK: body.top_k, strategy: body.strategy,
  });
  const log_id = await logQuery({
    tenantId: req.tenantId, endpoint: 'ask', question: body.question, documentIds: body.document_ids,
    strategy: body.strategy, topK: body.top_k, chunks: result.chunks, status: result.status,
    answer: result.answer, citations: result.citations, rawLlmOutput: result.raw_llm_output,
    latencyMs: Date.now() - t0,
  });
  const { raw_llm_output: _omit, ...publicResult } = result;
  res.json({ log_id, ...publicResult });
});
